import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
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
  ) {}

  /**
   * 一键全员月度薪酬智能核算引擎
   * 1. 抓取所有正常在职/试用期员工
   * 2. 统计当月核准的请假记录折算缺勤扣除
   * 3. 按照标准税法与社保基数自动测算五险一金、应发与实发
   */
  async calculateMonthlySalary(dto: CalculateSalaryDto) {
    const { yearMonth } = dto;
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new BusinessException('月份格式不正确，应形如 2026-10');
    }

    // 查询当前有效在岗员工
    const employees = await this.employeeRepo.find({
      where: [{ status: 1 }, { status: 3 }],
      relations: ['dept'],
    });

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

    for (const emp of employees) {
      // 基础薪资基数 (来自员工档案，若未设定则兜底 6000)
      const baseSalary = Number(emp.salary) > 0 ? Number(emp.salary) : 6000;
      // 岗位津贴与综合补贴
      const postSalary = Math.round(baseSalary * 0.2);
      const performanceSalary = Math.round(baseSalary * 0.15);
      const overtimeSalary = 0;
      const allowance = 500; // 500元餐补与通信补贴

      // 统计当月请假单 (仅计算已审核通过状态的假勤)
      const leaves = await this.leaveRepo.find({
        where: {
          empId: emp.id,
          status: 'APPROVED',
          startTime: Between(new Date(`${startDate} 00:00:00`), new Date(`${endDate} 23:59:59`)),
        },
      });

      let leaveDays = 0;
      for (const l of leaves) {
        leaveDays += Number(l.days || 0);
      }

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
      let record = await this.salaryRepo.findOne({
        where: { empId: emp.id, yearMonth },
      });

      if (!record) {
        record = this.salaryRepo.create({
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
        if (record.status === 1) {
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
        }
      }

      await this.salaryRepo.save(record);
    }

    return {
      yearMonth,
      totalEmployees: employees.length,
      createdCount,
      updatedCount,
      message: `核算完成：新增 ${createdCount} 笔，更新 ${updatedCount} 笔`,
    };
  }

  /**
   * 分页与高级多维查询薪资列表，附带月度全盘财务 KPI 聚合统计
   */
  async getSalaryList(query: QuerySalaryDto) {
    const {
      page = 1,
      pageSize = 10,
      yearMonth,
      deptId,
      keyword,
      status,
    } = query;

    const qb = this.salaryRepo
      .createQueryBuilder('salary')
      .leftJoinAndSelect('salary.employee', 'employee')
      .leftJoinAndSelect('employee.dept', 'dept')
      .orderBy('salary.yearMonth', 'DESC')
      .addOrderBy('employee.empNo', 'ASC');

    if (yearMonth) {
      qb.andWhere('salary.yearMonth = :yearMonth', { yearMonth });
    }

    if (deptId) {
      qb.andWhere('employee.deptId = :deptId', { deptId });
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

    // 统计总体 KPI (总应发、总实发、总扣税社保)
    const statsQb = qb.clone();
    const statsResult = await statsQb
      .select('SUM(salary.grossSalary)', 'totalGross')
      .addSelect('SUM(salary.netSalary)', 'totalNet')
      .addSelect('SUM(salary.socialSecurity + salary.housingFund + salary.tax + salary.leaveDeduction)', 'totalDeduction')
      .addSelect('COUNT(salary.id)', 'totalCount')
      .getRawOne();

    // 分页列表
    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      stats: {
        totalGross: Number(statsResult?.totalGross || 0).toFixed(2),
        totalNet: Number(statsResult?.totalNet || 0).toFixed(2),
        totalDeduction: Number(statsResult?.totalDeduction || 0).toFixed(2),
        totalCount: Number(statsResult?.totalCount || 0),
      },
    };
  }

  /**
   * 单条薪酬明细修改并自动联动应发实发
   */
  async updateSalary(id: number, dto: UpdateSalaryDto) {
    const record = await this.salaryRepo.findOne({ where: { id } });
    if (!record) {
      throw new BusinessException('薪资记录不存在');
    }

    if (record.status === 3) {
      throw new BusinessException('该记录已处于发放完成状态，禁止修改');
    }

    Object.assign(record, dto);

    // 重新计算应发
    record.grossSalary =
      Math.round(
        (Number(record.baseSalary) +
          Number(record.postSalary) +
          Number(record.performanceSalary) +
          Number(record.overtimeSalary) +
          Number(record.allowance)) *
          100
      ) / 100;

    // 重新计算实发
    record.netSalary = Math.max(
      0,
      Math.round(
        (Number(record.grossSalary) -
          Number(record.leaveDeduction) -
          Number(record.socialSecurity) -
          Number(record.housingFund) -
          Number(record.tax)) *
          100
      ) / 100
    );

    return this.salaryRepo.save(record);
  }

  /**
   * 批量审批流转与发放
   */
  async batchConfirm(dto: BatchConfirmSalaryDto) {
    const { ids, targetStatus } = dto;
    if (!ids || ids.length === 0) {
      throw new BusinessException('请至少选择一条记录');
    }

    await this.salaryRepo.update(
      { id: In(ids) },
      { status: targetStatus }
    );

    return {
      success: true,
      affected: ids.length,
    };
  }

  /**
   * 导出月度薪资明细 Excel 报表
   */
  async exportExcel(yearMonth: string): Promise<Buffer> {
    const records = await this.salaryRepo.find({
      where: yearMonth ? { yearMonth } : {},
      relations: ['employee', 'employee.dept'],
      order: { yearMonth: 'DESC', empId: 'ASC' },
    });

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
    if (!user) {
      throw new BusinessException('当前用户不存在');
    }

    // 通过姓名或用户名关联员工记录
    const employee = await this.employeeRepo.findOne({
      where: [{ name: user.realName }, { empNo: user.username }],
      relations: ['dept'],
    });

    if (!employee) {
      return [];
    }

    // 仅向员工展示已发放(status=3)或已核准(status=2)的工资条
    const records = await this.salaryRepo.find({
      where: {
        empId: employee.id,
        status: In([2, 3]),
      },
      order: { yearMonth: 'DESC' },
    });

    return records.map((r) => ({
      id: r.id,
      yearMonth: r.yearMonth,
      grossSalary: r.grossSalary,
      netSalary: r.netSalary,
      status: r.status,
      hasPassword: !!r.payslipPassword,
      deptName: employee.dept?.deptName,
      employeeName: employee.name,
      empNo: employee.empNo,
    }));
  }

  /**
   * 员工端: 安全验证并解密展示工资条完整收入/扣减明细
   */
  async verifyPayslip(userId: number, dto: VerifyPayslipDto) {
    const { salaryId, password } = dto;
    const record = await this.salaryRepo.findOne({
      where: { id: salaryId },
      relations: ['employee', 'employee.dept'],
    });

    if (!record) {
      throw new BusinessException('工资条记录不存在');
    }

    // 若该条记录配置了独立密码，进行防偷窥比对
    if (record.payslipPassword && password) {
      const match = await bcrypt.compare(password, record.payslipPassword);
      if (!match) {
        throw new BusinessException('工资条安全口令错误，请重新输入');
      }
    }

    return record;
  }
}
