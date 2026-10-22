import { Injectable, Logger } from '@nestjs/common';
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
import { Response } from 'express';

@Injectable()
export class EmployeeService extends BaseService<Employee> {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,
    @InjectRepository(AnnualLeave)
    private readonly annualRepo: Repository<AnnualLeave>,
    private readonly excelService: ExcelService,
    dataSource: DataSource,
  ) {
    super(empRepo, dataSource);
  }

  /**
   * 分页查询员工（支持部门级联、模糊检索）
   */
  async findEmployeePage(
    queryDto: QueryEmployeeDto,
  ): Promise<PageResultDto<Employee>> {
    const page = Number(queryDto.page) || 1;
    const pageSize = Number(queryDto.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.empRepo
      .createQueryBuilder('emp')
      .leftJoinAndSelect('emp.dept', 'dept')
      .leftJoinAndSelect('emp.idCardFront', 'idCardFront')
      .leftJoinAndSelect('emp.idCardBack', 'idCardBack')
      .leftJoinAndSelect('emp.eduCert', 'eduCert')
      .skip(skip)
      .take(pageSize)
      .orderBy('emp.id', 'DESC');

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
   * 创建员工（同时事务初始化当年年假 5 天）
   */
  async createEmployee(dto: CreateEmployeeDto): Promise<Employee> {
    const exist = await this.empRepo.findOne({
      where: { empNo: dto.empNo },
    });
    if (exist) {
      throw new BusinessException(`工号 ${dto.empNo} 已存在`);
    }

    return this.withTransaction(async (manager) => {
      const emp = manager.create(Employee, dto);
      const savedEmp = await manager.save(emp);

      // 初始化当前年度年假账户
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
   * 生成员工导入模板
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
   * 重点：Excel 批量导入员工（严格全量校验 + 事务级回滚）
   * 规则：逐行校验，若任一行出错，整批事务回滚，不保存任何数据，返回所有错误行号
   */
  async importEmployeesFromExcel(fileBuffer: Buffer) {
    // 预先加载系统所有部门供名称匹配
    const depts = await this.deptRepo.find();
    const deptMap = new Map<string, number>();
    depts.forEach((d) => deptMap.set(d.deptName.trim(), d.id));

    // 预先查询系统中已有的工号
    const existingEmployees = await this.empRepo.find({ select: ['empNo'] });
    const existingEmpNoSet = new Set(existingEmployees.map((e) => e.empNo));

    const batchEmpNos = new Set<string>();

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

    const parseResult = await this.excelService.parseAndValidate<any>(
      fileBuffer,
      columnDefs,
    );

    // 严格校验：若存在任意错误，直接返回错误明细，不进入事务入库
    if (!parseResult.success) {
      return {
        success: false,
        message: `导入校验失败，共发现 ${parseResult.errors.length} 处错误，数据已全量回滚未入库`,
        errors: parseResult.errors,
      };
    }

    // 全部行校验通过，开启独立事务批量插入
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

        // 初始化年假
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
   * 重点：大数据流式分页导出员工列表（防止内存溢出 OOM）
   */
  async exportEmployeesStream(
    res: Response,
    queryDto: QueryEmployeeDto,
  ): Promise<void> {
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

    await this.excelService.exportLargeDataStream(
      res,
      `员工档案清单_${new Date().toISOString().slice(0, 10)}`,
      columns,
      async (page, pageSize) => {
        const query = { ...queryDto, page, pageSize };
        const result = await this.findEmployeePage(query);

        const mappedList = result.list.map((emp) => ({
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
      500, // 每次查询 500 条流式下发
    );
  }
}
