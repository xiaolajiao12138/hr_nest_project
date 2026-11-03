import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { applyScope, assertScope, assertDepartmentScope, requirePermission, isAdmin } from '../../common/security/data-scope';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Dept } from '../department/entities/dept.entity';
import { AnnualLeave } from '../leave/entities/annual.entity';
import { BaseService } from '../../common/base/base.service';
import { ExcelService, ColumnDefinition } from '../../excel/excel.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  QueryEmployeeDto,
} from './dto/employee.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { sanitizeResponse } from '../../common/security/sanitize';
import { AuthCacheService } from '../rbac/services/auth-cache.service';
import { SysFile } from '../../upload/entities/file.entity';
import type { Response } from 'express';

/**
 * 员工档案管理与 Excel 大数据批量服务类
 *
 * 核心业务领域：
 * 1. 员工花名册档案的多条件联表检索与分页
 * 2. 入职建档强事务：新增员工档案 + 自动原子开户初始化当前年度 5 天年假账户
 * 3. Excel 严格校验批量导入：导入前进行工号唯一性、部门存在性、手机身份证格式全量逐行预检，任一失败全量阻断
 * 4. 大数据流式分页导出：基于 ExcelJS 写入流分页拉取数据，彻底杜绝数十万行数据导出时的 Node.js OOM 内存溢出
 */
@Injectable()
export class EmployeeService extends BaseService<Employee> {
  /** 日志记录器 */
  private readonly logger = new Logger(EmployeeService.name);

  /**
   * 构造函数注入实体仓储、部门、年假及 Excel 工具服务
   *
   * @param empRepo 员工档案实体 Repository
   * @param deptRepo 部门实体 Repository（用于部门名称与 ID 的预匹配）
   * @param annualRepo 年假账户实体 Repository
   * @param excelService Excel 流式导入导出核心服务
   * @param dataSource TypeORM 数据源
   */
  constructor(
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,
    @InjectRepository(AnnualLeave)
    private readonly annualRepo: Repository<AnnualLeave>,
    private readonly excelService: ExcelService,
    dataSource: DataSource,
    private readonly authCacheService: AuthCacheService,
  ) {
    super(empRepo, dataSource);
  }

  /**
   * 分页条件查询员工档案列表（精简模式：轻量化返回列表所需字段，降低数据库联表与网络传输负载）
   * 详细的身份证正反面及学历证明等大附件仅在点击编辑/详情时通过独立的 findById 按需查询
   *
   * @param queryDto 查询过滤条件（工号/姓名/手机模糊关键字、部门ID、在职状态、岗位）
   * @returns 标准分页响应对象
   */
  async findEmployeePage(
    queryDto: QueryEmployeeDto, user?: CurrentUserPayload
  ): Promise<PageResultDto<Employee>> {
    const page = Number(queryDto.page) || 1;
    const pageSize = Number(queryDto.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // 列表仅精简关联部门名称，杜绝多层深层附件大表冗余 Join
    const qb = this.empRepo
      .createQueryBuilder('emp')
      .leftJoinAndSelect('emp.dept', 'dept')
      .skip(skip)
      .take(pageSize)
      .orderBy('emp.id', 'DESC');

    // 动态拼接搜索条件
    applyScope(qb, user, 'employee', 'emp.deptId', 'emp.id');
    if (queryDto.keyword) {
      qb.andWhere(
        '(emp.empNo LIKE :kw OR emp.name LIKE :kw OR emp.phone LIKE :kw)',
        { kw: `%${queryDto.keyword}%` },
      );
    }

    if (queryDto.deptId) {
      qb.andWhere('emp.deptId = :deptId', { deptId: queryDto.deptId });
    }

    if (queryDto.status !== undefined && queryDto.status !== null) {
      qb.andWhere('emp.status = :status', { status: queryDto.status });
    }

    if (queryDto.post) {
      qb.andWhere('emp.post LIKE :post', { post: `%${queryDto.post}%` });
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 创建员工档案（强一致事务：建档 + 原子开户初始化当年年假）
   *
   * @param dto 创建员工入参载荷
   * @returns 创建成功后的员工实体
   * @throws BusinessException 当工号已被占用时抛出业务异常
   */
  async createEmployee(dto: CreateEmployeeDto, user?: CurrentUserPayload): Promise<Employee> {
    assertDepartmentScope(user, 'employee', dto.deptId);
    requirePermission(user, 'hr:employee:sensitive');
    await this.validateAttachments(dto, user);
    // 校验工号唯一性，防止录入重复工号
    const exist = await this.empRepo.findOne({
      where: { empNo: dto.empNo },
    });
    if (exist) {
      throw new BusinessException(`工号 ${dto.empNo} 已存在`);
    }

    // 开启入职事务：员工记录与年假初始额度原子提交
    return this.withTransaction(async (manager) => {
      const emp = manager.create(Employee, dto);
      const savedEmp = await manager.save(emp);

      // 同步初始化当前年度 5.0 天年假账户
      const currentYear = new Date().getFullYear();
      const annual = manager.create(AnnualLeave, {
        empId: savedEmp.id,
        year: currentYear,
        totalDays: 5.0,
        usedDays: 0.0,
        remainDays: 5.0,
      });
      await manager.save(annual);

      return savedEmp;
    });
  }

  /**
   * 生成供用户下载的员工批量导入 Excel 模板
   *
   * @returns 包含表头与标准示例数据的 Excel 文件 Buffer 二进制流
   */
  async getImportTemplate(): Promise<Buffer> {
    return this.excelService.generateTemplate(
      [
        { header: '工号', key: 'empNo', sampleValue: 'EMP2026001' },
        { header: '姓名', key: 'name', sampleValue: '张三' },
        { header: '性别', key: 'gender', sampleValue: '男' },
        { header: '手机号码', key: 'phone', sampleValue: '13812345678' },
        { header: '身份证号', key: 'idCard', sampleValue: '110101199501011234' },
        { header: '入职日期', key: 'entryDate', sampleValue: '2026-03-01' },
        { header: '部门名称', key: 'deptName', sampleValue: '研发中心' },
        { header: '岗位职位', key: 'post', sampleValue: '高级前端工程师' },
        { header: '学历', key: 'education', sampleValue: '本科' },
        { header: '月基本薪资', key: 'salary', sampleValue: 18000 },
      ],
      '员工导入模板',
    );
  }

  /**
   * 重点业务：Excel 批量导入员工（严格全量预校验 + 事务级原子入库）
   *
   * 数据一致性与安全规则：
   * 1. 预先加载系统所有正常部门并建立 Name -> ID 哈希映射；
   * 2. 预先加载数据库全量工号，在内存 Set 中进行 O(1) 冲突比对；
   * 3. 逐行执行手机正则、身份证正则、部门存在性、文件内工号唯一性强校验；
   * 4. 若发现任一行存在校验错误，整批数据全量回滚不予入库，一次性返回所有错误行号及具体原因；
   * 5. 校验全部通过后，开启独立数据库事务批量持久化，并为每名员工自动开户初始化年假。
   *
   * @param fileBuffer 上传的 Excel 原始二进制数据
   * @returns 校验结果或导入成功报告
   */
  async importEmployeesFromExcel(fileBuffer: Buffer, user?: CurrentUserPayload) {
    requirePermission(user, 'hr:employee:sensitive');
    // 预先加载系统所有部门供名称快速匹配
    const depts = await this.deptRepo.find();
    const deptMap = new Map<string, number>();
    depts.forEach((d) => deptMap.set(d.deptName.trim(), d.id));
    for (const dept of depts) {
      try { assertDepartmentScope(user, 'employee', dept.id); }
      catch { deptMap.delete(dept.deptName.trim()); }
    }

    // 预先查询系统中已占用的工号清单
    const existingEmployees = await this.empRepo.find({ select: ['empNo'] });
    const existingEmpNoSet = new Set(existingEmployees.map((e) => e.empNo));

    // 用于检测当前上传文件内部是否出现相互重复工号
    const batchEmpNos = new Set<string>();

    // 声明列定义与逐行验证规则
    const columnDefs: ColumnDefinition[] = [
      {
        header: '工号',
        key: 'empNo',
        required: true,
        validate: (val) => {
          if (existingEmpNoSet.has(val)) return '工号已在系统存在';
          if (batchEmpNos.has(val)) return '导入文件中工号重复';
          batchEmpNos.add(val);
          return null;
        },
      },
      { header: '姓名', key: 'name', required: true },
      { header: '性别', key: 'gender', required: true },
      {
        header: '手机号码',
        key: 'phone',
        required: true,
        validate: (val) =>
          /^1[3-9]\d{9}$/.test(val) ? null : '手机号格式不正确',
      },
      {
        header: '身份证号',
        key: 'idCard',
        required: true,
        validate: (val) =>
          /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(val)
            ? null
            : '身份证号格式不合规',
      },
      { header: '入职日期', key: 'entryDate', required: true },
      {
        header: '部门名称',
        key: 'deptName',
        required: true,
        validate: (val) =>
          deptMap.has(val) ? null : `部门【${val}】在系统中不存在`,
      },
      { header: '岗位职位', key: 'post', required: true },
      { header: '学历', key: 'education', required: false },
      { header: '月基本薪资', key: 'salary', required: false },
    ];

    // 执行多行解析与规则校验
    const parseResult = await this.excelService.parseAndValidate<any>(
      fileBuffer,
      columnDefs,
    );

    // 严格防御：若发现任何格式或业务错误，全量阻断并返回错误清单
    if (!parseResult.success) {
      return {
        success: false,
        message: `导入校验失败，共发现 ${parseResult.errors.length} 处错误，数据已全量回滚未入库`,
        errors: parseResult.errors,
      };
    }

    // 全部行校验通过，开启独立事务批量插入并初始化年假
    const currentYear = new Date().getFullYear();

    await this.withTransaction(async (manager) => {
      for (const row of parseResult.validRows) {
        const deptId = deptMap.get(row.deptName.trim());
        const emp = manager.create(Employee, {
          empNo: row.empNo,
          name: row.name,
          gender: row.gender || '男',
          phone: row.phone,
          idCard: row.idCard,
          entryDate: row.entryDate,
          deptId,
          post: row.post,
          education: row.education || '本科',
          salary: parseFloat(row.salary) || 0,
          status: 1,
        });
        const savedEmp = await manager.save(emp);

        // 事务内同步初始化年假账户
        const annual = manager.create(AnnualLeave, {
          empId: savedEmp.id,
          year: currentYear,
          totalDays: 5.0,
          usedDays: 0.0,
          remainDays: 5.0,
        });
        await manager.save(annual);
      }
    });

    return {
      success: true,
      message: `成功导入 ${parseResult.validRows.length} 名员工档案`,
      count: parseResult.validRows.length,
    };
  }

  /**
   * 重点特性：大数据流式分页导出员工列表（杜绝 Node.js 内存溢出 OOM）
   *
   * 性能优化保障：
   * 1. 采用 HTTP 分块传输（Transfer-Encoding: chunked）配合 ExcelJS WorkbookWriter；
   * 2. 避免一次性在内存中查询和组装十万行实体，按批次（如 500 条）分页拉取并写入流；
   * 3. 写入完成后主动调用 commit 刷新缓冲区，维持极低的内存占用（平稳在 50MB 以内）。
   *
   * @param res Express HTTP 响应对象
   * @param queryDto 导出检索条件
   */
  async exportEmployeesStream(
    res: Response,
    queryDto: QueryEmployeeDto, user?: CurrentUserPayload
  ): Promise<void> {
    // 导出列头定义
    const columns = [
      { header: '员工工号', key: 'empNo', width: 16 },
      { header: '姓名', key: 'name', width: 14 },
      { header: '性别', key: 'gender', width: 10 },
      { header: '手机号码', key: 'phone', width: 16 },
      { header: '身份证号', key: 'idCard', width: 22 },
      { header: '部门', key: 'deptName', width: 18 },
      { header: '岗位', key: 'post', width: 18 },
      { header: '入职日期', key: 'entryDate', width: 14 },
      { header: '学历', key: 'education', width: 12 },
      { header: '基本薪资', key: 'salary', width: 14 },
      { header: '状态', key: 'statusText', width: 12 },
    ];

    // 委托 ExcelService 执行底层流式管道下发
    await this.excelService.exportLargeDataStream(
      res,
      `员工档案清单_${new Date().toISOString().slice(0, 10)}`,
      columns,
      async (page, pageSize) => {
        // 分页异步查询数据
        const query = { ...queryDto, page, pageSize };
        const result = await this.findEmployeePage(query, user);

        // 转换为符合 Excel 列头映射的平面数据结构
        const mappedList = sanitizeResponse(result.list, user).map((emp) => ({
          empNo: emp.empNo,
          name: emp.name,
          gender: emp.gender,
          phone: emp.phone,
          idCard: emp.idCard,
          deptName: emp.dept?.deptName || '未分配',
          post: emp.post,
          entryDate: emp.entryDate,
          education: emp.education,
          salary: emp.salary,
          statusText:
            emp.status === 1 ? '在职' : emp.status === 2 ? '离职' : '试用期',
        }));

        return { list: mappedList, total: result.total };
      },
      500, // 每批次 500 条分页拉取流式下发
    );
  }

  async getEmployeeDetail(id: number, relations: string[] = [], user?: CurrentUserPayload) {
    const employee = await this.findById(id, relations);
    assertScope(user, 'employee', employee.id, employee.deptId);
    return employee;
  }

  async updateEmployee(id: number, dto: UpdateEmployeeDto, user: CurrentUserPayload) {
    await this.getEmployeeDetail(id, [], user);
    if(dto.status===2) await this.assertCanDeactivateEmployee(id,user);
    if (dto.deptId !== undefined) assertDepartmentScope(user, 'employee', dto.deptId);
    requirePermission(user, 'hr:employee:sensitive');
    await this.validateAttachments(dto, user, id);
    const result = await this.withTransaction(async manager => {
      await manager.update(Employee, id, dto);
      if (dto.status===2) await manager.query('UPDATE sys_user SET status=0 WHERE employee_id=$1',[id]);
      if (dto.deptId !== undefined) await manager.query('UPDATE sys_user SET dept_id = $1 WHERE employee_id = $2', [dto.deptId,id]);
      return manager.findOneByOrFail(Employee, {id});
    });
    await this.authCacheService.clearAllAuthorities();
    return result;
  }

  async archiveEmployee(id: number, user: CurrentUserPayload) {
    await this.getEmployeeDetail(id, [], user);
    await this.assertCanDeactivateEmployee(id,user);
    // 人事离职归档保留工资、请假历史，禁止通过 CASCADE 物理删除。
    await this.withTransaction(async manager => {
      await manager.update(Employee, id, { status: 2 });
      await manager.query('UPDATE sys_user SET status = 0 WHERE employee_id = $1', [id]);
    });
    await this.authCacheService.clearAllAuthorities();
    return true;
  }

  private async validateAttachments(dto: any, user: CurrentUserPayload, employeeId?: number) {
    const previous = employeeId ? await this.empRepo.findOneBy({ id: employeeId }) : null;
    for (const key of ['idCardFrontId','idCardBackId','eduCertId']) {
      if (!dto[key] || dto[key] === previous?.[key]) continue;
      const file = await this.dataSource.getRepository(SysFile).findOneBy({ id: dto[key] });
      if (!file || (!isAdmin(user) && file.ownerUserId !== user.userId) || !/^(idcard|cert|employee)\//.test(file.filePath)) throw new BusinessException('附件不存在或不可用于该员工档案');
    }
  }

  async getMyEmployee(user: CurrentUserPayload) {
    if (!user?.userId) throw new ForbiddenException('缺少有效身份');
    const employee = user.employeeId ? await this.empRepo.createQueryBuilder('emp')
      .leftJoinAndSelect('emp.dept', 'dept')
      .select(['emp.id', 'emp.empNo', 'emp.name', 'emp.deptId', 'emp.status', 'dept.id', 'dept.deptName'])
      .where('emp.id = :id', { id: user.employeeId }).getOne() : null;
    return employee
      ? { bound: true, employee }
      : { bound: false, employee: null, message: '账号尚未关联员工档案，请联系管理员完成关联；提供员工ID不能替代账号绑定。' };
  }

  async getEmployeeOptions(purpose: string, query: QueryEmployeeDto, user: CurrentUserPayload) {
    const permissions = { leave: 'hr:leave:list', attendance: 'hr:attendance:schedule', performance: 'hr:performance:start', user: 'system:user:assign', employee: 'hr:employee:list' };
    if (!Object.prototype.hasOwnProperty.call(permissions, purpose)) throw new BusinessException('无效候选用途');
    requirePermission(user, permissions[purpose]);
    const page = Math.max(1, Number(query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const qb = this.empRepo.createQueryBuilder('emp').leftJoinAndSelect('emp.dept','dept').select(['emp.id','emp.empNo','emp.name','emp.deptId','emp.post','emp.status','dept.id','dept.deptName']).where('emp.status IN (1,3)');
    applyScope(qb, user, purpose === 'user' ? 'employee' : purpose, 'emp.deptId','emp.id');
    if (query.deptId) qb.andWhere('emp.deptId = :deptId', {deptId:query.deptId});
    if (query.keyword) qb.andWhere('(emp.name LIKE :kw OR emp.empNo LIKE :kw)', {kw:'%'+query.keyword+'%'});
    const [list,total] = await qb.orderBy('emp.empNo','ASC').skip((page-1)*pageSize).take(pageSize).getManyAndCount();
    return PageResultDto.create(list,total,page,pageSize);
  }

  private async assertCanDeactivateEmployee(id:number,user:CurrentUserPayload){
    const protectedAccounts=await this.dataSource.query(`SELECT u.id FROM sys_user u LEFT JOIN sys_user_role ur ON ur.user_id=u.id LEFT JOIN sys_role r ON r.id=ur.role_id WHERE u.employee_id=$1 AND (u.id=$2 OR u.username='admin' OR r.role_key='admin') LIMIT 1`,[id,user.userId]);
    if(protectedAccounts.length) throw new BusinessException('不能通过员工归档停用当前账号或管理员账号');
  }

}
