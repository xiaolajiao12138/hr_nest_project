import { applyScope, assertScope, assertEmployeeScope, requirePermission } from '../../common/security/data-scope';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, DataSource } from 'typeorm';
import { SalaryRecord } from './entities/salary.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Leave } from '../leave/entities/leave.entity';
import { User } from '../rbac/entities/user.entity';
import {
  CalculateSalaryDto,
  QuerySalaryDto,
  UpdateSalaryDto,
  BatchConfirmSalaryDto,
  VerifyPayslipDto,
} from './dto/salary.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SalaryService {
  private readonly logger = new Logger(SalaryService.name);

  constructor(
    @InjectRepository(SalaryRecord)
    private readonly salaryRepo: Repository<SalaryRecord>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}



/**
   * 一键全员月度薪酬智能核算引擎
   * 1. 抓取所有正常在职/试用期员工
   * 2. 统计当月核准的请假记录折算缺勤扣除
   * 3. 按照标准税法与社保基数自动测算五险一金、应发与实发
   */
  async calculateMonthlySalary(dto: CalculateSalaryDto, user?: CurrentUserPayload) {
    requirePermission(user, 'hr:salary:calc');
    const { yearMonth } = dto;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      throw new BusinessException('月份格式不正确，应形如 2026-10');
    }

    return this.dataSource.transaction(async manager => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['salary:'+yearMonth]);
    // 查询当前有效在岗员工
    const employees = await applyScope(manager.createQueryBuilder(Employee, 'emp').where('emp.status IN (:...statuses)', { statuses: [1, 3] }),
      user, 'salary', 'emp.deptId', 'emp.id').getMany();

    if (employees.length === 0) {
      throw new BusinessException('当前系统中没有在职员工可供核算薪酬');
    }

    // 计算月份起止日期
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const startDate = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    let createdCount = 0;
    let updatedCount = 0;

    const leavesByEmployee = new Map<number, number>();
    const leaveRows = await manager.createQueryBuilder(Leave, 'l').select('l.empId','empId').addSelect('SUM(l.days)','days')
      .where('l.empId IN (:...empIds)', {empIds:employees.map(e => e.id)}).andWhere("l.status = 'APPROVED' AND l.leaveType = 'CASUAL'")
      .andWhere('l.startTime >= :start AND l.startTime < :end', {start:new Date(year,month-1,1),end:new Date(year,month,1)}).groupBy('l.empId').getRawMany();
    for (const row of leaveRows) leavesByEmployee.set(Number(row.empId),Number(row.days));
    for (const emp of employees) {
      await assertEmployeeScope(manager, user, 'salary', emp.id);
      // 基础薪资基数来自员工档案
      const baseSalary = Number(emp.salary ?? 0);
      // 岗位津贴与综合补贴
      const postSalary = Math.round(baseSalary * 0.2);
      const performanceSalary = Math.round(baseSalary * 0.15);
      const overtimeSalary = 0;
      const allowance = 500; // 500元餐补与通信补贴

      // 统计当月请假单 (仅计算已审核通过状态的假勤)
      const leaveDays = leavesByEmployee.get(emp.id) || 0;

      // 法定计薪工作日标准为 21.75 天，计算事假缺勤扣除
      const dailySalary = baseSalary / 21.75;
      const leaveDeduction = Math.min(baseSalary, Math.round(dailySalary * leaveDays * 100) / 100);

      // 应发合计 (Gross Salary)
      const grossSalary = Math.round(
        (baseSalary + postSalary + performanceSalary + overtimeSalary + allowance) * 100
      ) / 100;

      // 个人承担社保 (约 10.5%) 与住房公积金 (约 7%)
      const socialSecurity = Math.round(baseSalary * 0.105 * 100) / 100;
      const housingFund = Math.round(baseSalary * 0.07 * 100) / 100;

      // 应纳税所得额测算 (免征额 5000)
      const taxableIncome = Math.max(
        0,
        grossSalary - leaveDeduction - socialSecurity - housingFund - 5000
      );
      let tax = 0;
      if (taxableIncome > 0) {
        if (taxableIncome <= 3000) {
          tax = Math.round(taxableIncome * 0.03 * 100) / 100;
        } else if (taxableIncome <= 12000) {
          tax = Math.round((taxableIncome * 0.1 - 210) * 100) / 100;
        } else {
          tax = Math.round((taxableIncome * 0.2 - 1410) * 100) / 100;
        }
      }

      // 实发到手 (Net Salary)
      const netSalary = Math.max(
        0,
        Math.round((grossSalary - leaveDeduction - socialSecurity - housingFund - tax) * 100) / 100
      );

      // 查询是否已存在当月记录
      let record = await manager.findOne(SalaryRecord, {
        where: { empId: emp.id, yearMonth },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        record = manager.create(SalaryRecord, {
          empId: emp.id,
          yearMonth,
          baseSalary,
          postSalary,
          performanceSalary,
          overtimeSalary,
          allowance,
          leaveDeduction,
          socialSecurity,
          housingFund,
          tax,
          grossSalary,
          netSalary,
          status: 1, // 草稿
          remark: leaveDays > 0 ? `当月含请假考勤扣除 ${leaveDays} 天` : '系统智能核算生成',
        });
        createdCount++;
      } else {
        // 若已存在但未锁定发放，允许重新核算更新
        if (record.status === 1 && dto.overwrite === true) {
          Object.assign(record, {
            baseSalary,
            postSalary,
            performanceSalary,
            overtimeSalary,
            allowance,
            leaveDeduction,
            socialSecurity,
            housingFund,
            tax,
            grossSalary,
            netSalary,
            remark: leaveDays > 0 ? `当月含请假考勤扣除 ${leaveDays} 天` : '重新核算更新',
          });
          updatedCount++;
        } else { continue; }
      }

      await manager.save(record);
    }

    return {
      yearMonth,
      totalEmployees: employees.length,
      createdCount,
      updatedCount,
      message: `核算完成：新增 ${createdCount} 笔，更新 ${updatedCount} 笔`,
    };
    });
  }

  /**
   * 分页与高级多维查询薪资列表，附带月度全盘财务 KPI 聚合统计
   */
  async getSalaryList(query: QuerySalaryDto, user?: CurrentUserPayload) {
    const {
      page = 1,
      pageSize = 10,
      yearMonth,
      deptId,
      departmentId,
      keyword,
      status,
    } = query;

    const filterDeptId = deptId || departmentId;

    const qb = this.salaryRepo
      .createQueryBuilder('salary')
      .leftJoinAndSelect('salary.employee', 'employee')
      .leftJoinAndSelect('employee.dept', 'dept')
      .orderBy('salary.yearMonth', 'DESC')
      .addOrderBy('employee.empNo', 'ASC');

    applyScope(qb, user, 'salary', 'employee.deptId', 'salary.empId');
    if (yearMonth) {
      qb.andWhere('salary.yearMonth = :yearMonth', { yearMonth });
    }

    if (filterDeptId) {
      qb.andWhere('employee.deptId = :deptId', { deptId: filterDeptId });
    }

    if (status !== undefined && status !== null) {
      qb.andWhere('salary.status = :status', { status });
    }

    if (keyword) {
      qb.andWhere(
        '(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)',
        { kw: `%${keyword.trim()}%` }
      );
    }

    // 独立构建统计查询（绝不带 ORDER BY，避免 PostgreSQL 报 GROUP BY 语法错误）
    const statsQb = this.salaryRepo.createQueryBuilder('salary');
    statsQb.leftJoin('salary.employee', 'employee');
    applyScope(statsQb, user, 'salary', 'employee.deptId', 'salary.empId');
    if (yearMonth) {
      statsQb.andWhere('salary.yearMonth = :yearMonth', { yearMonth });
    }
    if (filterDeptId) {
      statsQb.andWhere('employee.deptId = :deptId', { deptId: filterDeptId });
    }
    if (status !== undefined && status !== null) {
      statsQb.andWhere('salary.status = :status', { status });
    }
    if (keyword) {
      statsQb.andWhere(
        '(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)',
        { kw: `%${keyword.trim()}%` }
      );
    }

    const statsResult = await statsQb
      .select('COALESCE(SUM(salary.grossSalary), 0)', 'totalGross')
      .addSelect('COALESCE(SUM(salary.netSalary), 0)', 'totalNet')
      .addSelect(
        'COALESCE(SUM(salary.socialSecurity + salary.housingFund + salary.tax + salary.leaveDeduction), 0)',
        'totalDeduction'
      )
      .addSelect('COUNT(salary.id)', 'totalCount')
      .addSelect('COUNT(CASE WHEN salary.status = 1 THEN 1 END)', 'draftCount')
      .addSelect('COUNT(CASE WHEN salary.status = 2 THEN 1 END)', 'confirmedCount')
      .addSelect('COUNT(CASE WHEN salary.status = 3 THEN 1 END)', 'paidCount')
      .getRawOne();

    // 分页列表
    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const kpi = {
      totalGross: Number(statsResult?.totalGross || 0),
      totalNet: Number(statsResult?.totalNet || 0),
      totalDeduction: Number(statsResult?.totalDeduction || 0),
      totalCount: Number(statsResult?.totalCount || 0),
      draftCount: Number(statsResult?.draftCount || 0),
      confirmedCount: Number(statsResult?.confirmedCount || 0),
      paidCount: Number(statsResult?.paidCount || 0),
    };

    return {
      list: list.map(record => this.salaryView(record)),
      total,
      page,
      pageSize,
      kpi,
      stats: {
        totalGross: kpi.totalGross.toFixed(2),
        totalNet: kpi.totalNet.toFixed(2),
        totalDeduction: kpi.totalDeduction.toFixed(2),
        totalCount: kpi.totalCount,
      },
    };
  }

  /**
   * 根据 ID 获取单条薪酬明细详情
   */
  async getSalaryDetail(id: number, user?: CurrentUserPayload) {
    const record = await this.salaryRepo.findOne({ where: { id }, relations: ['employee', 'employee.dept'] });
    if (!record) throw new BusinessException('记录不存在或不在授权范围内', 404);
    assertScope(user, 'salary', record.empId, record.employee?.deptId);
    return this.salaryView(record);
  }

  /**
   * 单条薪酬明细修改并自动联动应发实发
   */
  async updateSalary(id: number, dto: UpdateSalaryDto, user?: CurrentUserPayload) {
    requirePermission(user, 'hr:salary:edit');
    return this.dataSource.transaction(async manager => {
      const record = await manager.findOne(SalaryRecord, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!record) throw new BusinessException('记录不存在或不在授权范围内', 404);
      await assertEmployeeScope(manager as any, user, 'salary', record.empId);
      if (record.status !== 1) throw new BusinessException('仅草稿可修改，核准或已发工资请走更正流程');
      const { payslipPassword, ...amounts } = dto;
      for (const key of ['baseSalary','postSalary','performanceSalary','overtimeSalary','allowance','leaveDeduction','socialSecurity','housingFund','tax','remark']) {
        if (amounts[key] !== undefined) record[key] = amounts[key];
      }
      if (payslipPassword) record.payslipPassword = await bcrypt.hash(payslipPassword, 12);
      record.grossSalary = Math.round((Number(record.baseSalary) + Number(record.postSalary) + Number(record.performanceSalary)
        + Number(record.overtimeSalary) + Number(record.allowance)) * 100) / 100;
      record.netSalary = Math.max(0, Math.round((record.grossSalary - Number(record.leaveDeduction)
        - Number(record.socialSecurity) - Number(record.housingFund) - Number(record.tax)) * 100) / 100);
      return this.salaryView(await manager.save(record));
    });
  }

  /**
   * 批量审批流转与发放
   */
  async batchConfirm(dto: BatchConfirmSalaryDto, user?: CurrentUserPayload) {
    requirePermission(user, 'hr:salary:confirm');
    const ids = [...new Set(dto.ids)];
    if (!ids.length || ![2, 3].includes(dto.targetStatus)) throw new BusinessException('无效的发薪状态或记录');
    return this.dataSource.transaction(async manager => {
      const records = await manager.find(SalaryRecord, { where: { id: In(ids) }, lock: { mode: 'pessimistic_write' } });
      if (records.length !== ids.length) throw new BusinessException('记录不存在或不在授权范围内', 404);
      for (const record of records) {
        await assertEmployeeScope(manager as any, user, 'salary', record.empId);
        if (record.status !== dto.targetStatus - 1) throw new BusinessException('记录状态已变化，请刷新后重试');
      }
      const result = await manager.update(SalaryRecord, { id: In(ids), status: dto.targetStatus - 1 }, { status: dto.targetStatus });
      if (result.affected !== ids.length) throw new BusinessException('状态更新冲突，请刷新后重试');
      return { success: true, affected: result.affected };
    });
  }

  /**
   * 导出月度薪资明细 Excel 报表
   */
  async exportExcel(query: QuerySalaryDto, user?: CurrentUserPayload): Promise<Buffer> {
    const { yearMonth, status, keyword } = query;
    const qb = this.salaryRepo.createQueryBuilder('salary').leftJoinAndSelect('salary.employee', 'employee')
      .leftJoinAndSelect('employee.dept', 'dept').orderBy('salary.empId', 'ASC');
    applyScope(qb, user, 'salary', 'employee.deptId', 'salary.empId');
    if (yearMonth) qb.andWhere('salary.yearMonth = :month', { month: yearMonth });
    if (query.deptId || query.departmentId) qb.andWhere('employee.deptId = :dept', { dept: query.deptId || query.departmentId });
    if (status != null) qb.andWhere('salary.status = :status', { status });
    if (keyword) qb.andWhere('(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)', { kw: '%' + keyword.trim() + '%' });
    const records = await qb.getMany();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${yearMonth || '全期'}薪资明细宽表`);

    worksheet.columns = [
      { header: '所属月份', key: 'yearMonth', width: 12 },
      { header: '工号', key: 'empNo', width: 14 },
      { header: '姓名', key: 'name', width: 14 },
      { header: '所属部门', key: 'deptName', width: 16 },
      { header: '基本工资', key: 'baseSalary', width: 14 },
      { header: '岗位津贴', key: 'postSalary', width: 14 },
      { header: '绩效奖金', key: 'performanceSalary', width: 14 },
      { header: '加班补贴', key: 'overtimeSalary', width: 14 },
      { header: '综合补贴', key: 'allowance', width: 14 },
      { header: '应发工资合计', key: 'grossSalary', width: 16 },
      { header: '缺勤扣除', key: 'leaveDeduction', width: 14 },
      { header: '个人社保', key: 'socialSecurity', width: 14 },
      { header: '公积金', key: 'housingFund', width: 14 },
      { header: '个人所得税', key: 'tax', width: 14 },
      { header: '实发到手薪资', key: 'netSalary', width: 18 },
      { header: '状态', key: 'statusText', width: 12 },
    ];

    // 表头高亮设计
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };

    const statusMap: Record<number, string> = { 1: '待核算草稿', 2: '已核准待发', 3: '已发放' };

    for (const r of records) {
      worksheet.addRow({
        yearMonth: r.yearMonth,
        empNo: r.employee?.empNo || '-',
        name: r.employee?.name || '-',
        deptName: r.employee?.dept?.deptName || '-',
        baseSalary: Number(r.baseSalary).toFixed(2),
        postSalary: Number(r.postSalary).toFixed(2),
        performanceSalary: Number(r.performanceSalary).toFixed(2),
        overtimeSalary: Number(r.overtimeSalary).toFixed(2),
        allowance: Number(r.allowance).toFixed(2),
        grossSalary: Number(r.grossSalary).toFixed(2),
        leaveDeduction: Number(r.leaveDeduction).toFixed(2),
        socialSecurity: Number(r.socialSecurity).toFixed(2),
        housingFund: Number(r.housingFund).toFixed(2),
        tax: Number(r.tax).toFixed(2),
        netSalary: Number(r.netSalary).toFixed(2),
        statusText: statusMap[r.status] || '未知',
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * 员工端: 获取自己的历史电子工资条列表
   */
  async getMyPayslips(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.employeeId) return [];
    const employee = await this.employeeRepo.findOne({ where: { id: user.employeeId }, relations: ['dept'] });
    if (!employee) return [];
    const records = await this.salaryRepo.find({ where: { empId: employee.id, status: In([2, 3]) }, order: { yearMonth: 'DESC' } });
    return records.map(record => ({ id: record.id, yearMonth: record.yearMonth, status: record.status,
      hasPassword: !!record.payslipPassword, deptName: employee.dept?.deptName, employeeName: employee.name, empNo: employee.empNo }));
  }

  /**
   * 员工端: 安全验证并解密展示工资条完整收入/扣减明细
   */
  async verifyPayslip(userId: number, dto: VerifyPayslipDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.employeeId) throw new BusinessException('账号尚未关联员工档案', 403);
    const record = await this.salaryRepo.findOne({ where: { id: dto.salaryId, empId: user.employeeId, status: In([2, 3]) },
      relations: ['employee', 'employee.dept'] });
    if (!record) throw new BusinessException('工资条不存在或无权访问', 404);
    if (record.payslipPassword && (!dto.password || !(await bcrypt.compare(dto.password, record.payslipPassword)))) {
      throw new BusinessException('工资条安全口令错误，请重新输入', 403);
    }
    return this.salaryView(record);
  }

  private salaryView(record: SalaryRecord) {
    const { payslipPassword, employee, ...data } = record;
    return { ...data, hasPassword: !!payslipPassword,
      totalDeduction: Number(record.leaveDeduction) + Number(record.socialSecurity) + Number(record.housingFund) + Number(record.tax),
      employee: employee ? { id: employee.id, empNo: employee.empNo, name: employee.name, post: employee.post,
        dept: employee.dept ? { id: employee.dept.id, deptName: employee.dept.deptName } : undefined } : undefined };
  }
}
