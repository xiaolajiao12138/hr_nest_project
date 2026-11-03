import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { ForbiddenException, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { applyScope, assertEmployeeScope, requirePermission, requireAdmin } from '../../common/security/data-scope';
import { PerformancePlan } from './entities/performance-plan.entity';
import { PerformanceRecord } from './entities/performance-record.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Dept } from '../department/entities/dept.entity';
import { SalaryRecord } from '../salary/entities/salary.entity';
import {
  QueryPerformanceRecordDto,
  CreatePerformancePlanDto,
  LaunchAppraisalDto,
  EvaluateAppraisalDto,
  SyncPerformanceToSalaryDto,
} from './dto/performance.dto';
import { PageResultDto } from '../../common/dto/page-result.dto';

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(
    @InjectRepository(PerformancePlan)
    private readonly planRepo: Repository<PerformancePlan>,

    @InjectRepository(PerformanceRecord)
    private readonly recordRepo: Repository<PerformanceRecord>,

    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,

    @InjectRepository(SalaryRecord)
    private readonly salaryRepo: Repository<SalaryRecord>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * 获取所有考评方案列表（附带完成度概览）
   */
  async getPlanList(user?: CurrentUserPayload): Promise<any[]> {
    const plans = await this.planRepo.find({ order: { id: 'DESC' } });
    const qb = this.scopedRecords(user).select('r.planId', 'planId').addSelect('COUNT(*)', 'total')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'COMPLETED')", 'completed').groupBy('r.planId');
    const counts = new Map((await qb.getRawMany()).map(r => [Number(r.planId), r]));
    return plans.map(plan => { const r = counts.get(plan.id); const total = Number(r?.total || 0), completed = Number(r?.completed || 0);
      return {...plan, totalEmployees: total, completedCount: completed, completionRate: total ? Math.round(completed/total*100) : 0}; });
  }

  private scopedRecords(user: CurrentUserPayload) {
    const qb = this.recordRepo.createQueryBuilder('r').innerJoin(Employee, 'scopeEmp', 'scopeEmp.id = r.empId');
    return applyScope(qb, user, 'performance', 'scopeEmp.deptId', 'r.empId');
  }

  /**
   * 创建新的绩效考评方案
   */
  async createPlan(dto: CreatePerformancePlanDto, user?: CurrentUserPayload): Promise<PerformancePlan> {
    requireAdmin(user);
    if (dto.status && !['DRAFT','IN_PROGRESS'].includes(dto.status)) throw new BadRequestException('新方案只能为草稿或进行中');
    if (new Date(dto.startDate) > new Date(dto.endDate)) throw new BadRequestException('开始日期不能晚于结束日期');
    const weightSelf = dto.weightSelf ?? 30;
    const weightManager = dto.weightManager ?? 70;
    if (weightSelf + weightManager !== 100) {
      throw new BadRequestException('自评权重与主管考评权重之和必须等于 100%');
    }

    const plan = this.planRepo.create({
      ...dto,
      weightSelf,
      weightManager,
      status: dto.status || 'IN_PROGRESS',
    });

    return this.planRepo.save(plan);
  }

  /**
   * 更新考评方案
   */
  async updatePlan(id: number, dto: Partial<CreatePerformancePlanDto>, user?: CurrentUserPayload): Promise<PerformancePlan> {
 requireAdmin(user);
 return this.dataSource.transaction(async manager => {
 const plan=await manager.findOne(PerformancePlan,{where:{id},lock:{mode:'pessimistic_write'}});
 if(!plan) throw new NotFoundException('考评方案不存在');
 if(plan.status==='COMPLETED') throw new BadRequestException('归档方案不可修改');
 if(await manager.countBy(PerformanceRecord,{planId:id})) throw new BadRequestException('已发起考评的方案不可变更规则');
 if(dto.status && !['DRAFT','IN_PROGRESS'].includes(dto.status)) throw new BadRequestException('请通过归档操作结束考评');
 if(plan.status==='IN_PROGRESS' && dto.status==='DRAFT') throw new BadRequestException('进行中的方案不能退回草稿');
 if((dto.weightSelf??plan.weightSelf)+(dto.weightManager??plan.weightManager)!==100) throw new BadRequestException('评分权重之和必须等于100%');
 if(new Date(dto.startDate??plan.startDate)>new Date(dto.endDate??plan.endDate)) throw new BadRequestException('开始日期不能晚于结束日期');
 Object.assign(plan,dto);return manager.save(plan);
 });
}

  /**
   * 删除考评方案
   */
  async deletePlan(id: number,user?:CurrentUserPayload):Promise<void>{requireAdmin(user);await this.dataSource.transaction(async manager=>{const plan=await manager.findOne(PerformancePlan,{where:{id},lock:{mode:'pessimistic_write'}});if(!plan)throw new NotFoundException('考评方案不存在');if(plan.status==='COMPLETED'||await manager.countBy(PerformanceRecord,{planId:id}))throw new BadRequestException('已有考评或已归档的方案不可删除');await manager.delete(PerformancePlan,id);});}

  /**
   * 分页查询考评明细列表
   */
  async findRecordPage(
    query: QueryPerformanceRecordDto, user?: CurrentUserPayload
  ): Promise<PageResultDto<PerformanceRecord>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.scopedRecords(user);

    if (query.planId) {
      qb.andWhere('r.planId = :planId', { planId: query.planId });
    }
    if (query.deptId) {
      qb.andWhere('r.deptId = :deptId', { deptId: query.deptId });
    }
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    if (query.rating) {
      qb.andWhere('r.rating = :rating', { rating: query.rating });
    }
    if (query.keyword) {
      qb.andWhere(
        '(r.empName LIKE :kw OR r.empNo LIKE :kw OR r.post LIKE :kw OR r.deptName LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    qb.orderBy('r.id', 'DESC').skip(skip).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 获取综合统计看板数据 (KPI 指标与等级正态分布)
   */
  async getAnalytics(planId?: number, user?: CurrentUserPayload): Promise<any> {
    let effectivePlanId = planId;
    if (!effectivePlanId) {
      const latestPlan = await this.planRepo.findOne({ order: { id: 'DESC' } });
      if (!latestPlan) {
        return {
          totalCount: 0,
          completedCount: 0,
          completionRate: 0,
          avgScore: 0,
          excellentRate: 0,
          distribution: { S: 0, A: 0, B: 0, C: 0, D: 0 },
        };
      }
      effectivePlanId = latestPlan.id;
    }

    const records = await this.scopedRecords(user).andWhere('r.planId = :planId', { planId: effectivePlanId }).getMany();
    const totalCount = records.length;
    const completedRecords = records.filter((r) => r.status === 'COMPLETED');
    const completedCount = completedRecords.length;
    const completionRate =
      totalCount > 0 ? Number(((completedCount / totalCount) * 100).toFixed(1)) : 0;

    const scores = completedRecords
      .map((r) => Number(r.finalScore))
      .filter((s) => !isNaN(s) && s >= 0);
    const avgScore =
      scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
        : 0;

    const distribution = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    completedRecords.forEach((r) => {
      const rating = r.rating?.toUpperCase();
      if (rating && distribution[rating] !== undefined) {
        distribution[rating] += 1;
      }
    });

    const excellentCount = distribution.S + distribution.A;
    const excellentRate =
      completedCount > 0
        ? Number(((excellentCount / completedCount) * 100).toFixed(1))
        : 0;

    return {
      planId: effectivePlanId,
      totalCount,
      completedCount,
      completionRate,
      avgScore,
      excellentRate,
      distribution,
    };
  }

  /**
   * 一键批量发起考评任务 (生成员工考评记录，自动去重)
   */
  async launchAppraisal(dto: LaunchAppraisalDto, user?: CurrentUserPayload): Promise<{ createdCount: number }> {
    requirePermission(user, 'hr:performance:start');
    return this.dataSource.transaction(async manager => {
    const plan = await manager.findOne(PerformancePlan, { where: { id: dto.planId }, lock: { mode: 'pessimistic_write' } });
    if (!plan) throw new NotFoundException('考评方案不存在');

    if (plan.status !== 'IN_PROGRESS') throw new BadRequestException('仅进行中的方案可发起考评');
    // 查询在职员工
    const empQb = this.employeeRepo.createQueryBuilder('emp').where('emp.status = 1');
    applyScope(empQb, user, 'performance', 'emp.deptId', 'emp.id');
    if (dto.deptIds && dto.deptIds.length > 0) {
      empQb.andWhere('emp.deptId IN (:...deptIds)', { deptIds: dto.deptIds });
    }
    if (dto.empIds && dto.empIds.length > 0) {
      empQb.andWhere('emp.id IN (:...empIds)', { empIds: dto.empIds });
    }

    const employees = await empQb.getMany();
    if (employees.length === 0) {
      throw new BadRequestException('未匹配到符合条件的在职员工');
    }

    // 查询部门字典名称
    const depts = await this.deptRepo.find();
    const deptMap = new Map<number, string>();
    depts.forEach((d) => deptMap.set(d.id, d.deptName));

    // 查询该方案下已存在的考评单
    const existingRecords = await this.recordRepo.find({
      where: { planId: dto.planId },
      select: ['empId'],
    });
    const existingEmpIdSet = new Set(existingRecords.map((r) => r.empId));

    const recordsToInsert: PerformanceRecord[] = [];
    for (const emp of employees) {
      if (!existingEmpIdSet.has(emp.id)) {
        const record = this.recordRepo.create({
          planId: dto.planId,
          empId: emp.id,
          empName: emp.name,
          empNo: emp.empNo,
          deptId: emp.deptId,
          deptName: deptMap.get(emp.deptId) || '综合部门',
          post: emp.post || '专业技术岗',
          selfScore: null,
          selfComment: '',
          managerScore: null,
          managerComment: '',
          finalScore: null,
          rating: null,
          coefficient: 1.0,
          status: 'PENDING_SELF',
        });
        recordsToInsert.push(record);
      }
    }

    if (recordsToInsert.length > 0) {
      await manager.save(recordsToInsert);
    }

    return { createdCount: recordsToInsert.length };
    });
  }

  /**
   * 闭环评定打分：支持员工自评、主管打分与综合定级推导
   */
  async evaluate(dto: EvaluateAppraisalDto, user?: CurrentUserPayload): Promise<PerformanceRecord> {
    requirePermission(user, 'hr:performance:eval');
    const initial = await this.recordRepo.findOneBy({ id: dto.recordId });
    if (!initial) throw new NotFoundException('考评记录不存在');
    await assertEmployeeScope(this.dataSource, user, 'performance', initial.empId);
    return this.dataSource.transaction(async manager => {
    const plan = await manager.findOne(PerformancePlan, { where: { id: initial.planId }, lock: { mode: 'pessimistic_write' } });
    const record = await manager.findOne(PerformanceRecord, { where: { id: dto.recordId }, lock: { mode: 'pessimistic_write' } });
    if (!record) throw new NotFoundException('考评记录不存在');


    if (!plan) throw new NotFoundException('关联考评方案不存在');

    if (plan.status !== 'IN_PROGRESS' || record.status === 'COMPLETED') throw new BadRequestException('归档或已完成的考评不可修改');
    if (dto.evalType === 'both') throw new BadRequestException('自评与主管评需分别提交');
    if (dto.evalType === 'self') {
      if (record.empId !== user.employeeId) throw new ForbiddenException('只能提交本人的自评');
      if (record.status !== 'PENDING_SELF' || dto.selfScore === undefined) throw new BadRequestException('当前状态不可自评或缺少自评分');
      if (dto.managerScore !== undefined || dto.managerComment !== undefined || dto.customFinalScore !== undefined || dto.customRating !== undefined) throw new ForbiddenException('自评不得设置主管评分或最终等级');
    } else {
      requirePermission(user, 'hr:performance:manager');
      if (record.empId === user.employeeId) throw new ForbiddenException('不能主管评审本人');
      if (record.status !== 'PENDING_MANAGER' || dto.managerScore === undefined) throw new BadRequestException('请先完成自评并填写主管评分');
      if (dto.selfScore !== undefined || dto.selfComment !== undefined) throw new ForbiddenException('主管不得代填自评');
    }
    // 1. 员工自评
    if (dto.evalType === 'self') {
      if (dto.selfScore !== undefined) {
        record.selfScore = Number(dto.selfScore);
      }
      if (dto.selfComment !== undefined) {
        record.selfComment = dto.selfComment;
      }
      if (record.status === 'PENDING_SELF') {
        record.status = 'PENDING_MANAGER';
      }
    }

    // 2. 主管考评
    if (dto.evalType === 'manager') {
      if (dto.managerScore !== undefined) {
        record.managerScore = Number(dto.managerScore);
      }
      if (dto.managerComment !== undefined) {
        record.managerComment = dto.managerComment;
      }
    }

    // 3. 计算最终综合得分与等级系数
    const selfScore = record.selfScore !== null ? Number(record.selfScore) : null;
    const managerScore = record.managerScore !== null ? Number(record.managerScore) : null;

    if (dto.customFinalScore !== undefined) {
      record.finalScore = Number(dto.customFinalScore);
    } else if (managerScore !== null) {
      if (selfScore !== null) {
        // 自评 + 主管加权
        const wSelf = plan.weightSelf / 100;
        const wManager = plan.weightManager / 100;
        record.finalScore = Number((selfScore * wSelf + managerScore * wManager).toFixed(1));
      } else {
        record.finalScore = managerScore;
      }
    }

    // 4. 等级与系数推导
    if (dto.customRating) {
      record.rating = dto.customRating.toUpperCase();
      record.coefficient = this.calculateCoefficient(record.rating);
    } else if (record.finalScore !== null) {
      const score = Number(record.finalScore);
      if (score >= 95) {
        record.rating = 'S';
        record.coefficient = 1.5;
      } else if (score >= 85) {
        record.rating = 'A';
        record.coefficient = 1.2;
      } else if (score >= 70) {
        record.rating = 'B';
        record.coefficient = 1.0;
      } else if (score >= 60) {
        record.rating = 'C';
        record.coefficient = 0.8;
      } else {
        record.rating = 'D';
        record.coefficient = 0.0;
      }
    }

    // 若主管打完分，自动完成
    if (managerScore !== null) {
      record.status = 'COMPLETED';
      record.evaluatedAt = new Date();
    }

    return manager.save(record);
    });
  }

  /**
   * 根据等级推导系数
   */
  private calculateCoefficient(rating: string): number {
    switch (rating.toUpperCase()) {
      case 'S':
        return 1.5;
      case 'A':
        return 1.2;
      case 'B':
        return 1.0;
      case 'C':
        return 0.8;
      case 'D':
        return 0.0;
      default:
        return 1.0;
    }
  }

  /**
   * 考评方案归档
   */
  async archivePlan(planId: number, user?: CurrentUserPayload): Promise<void> {
    requireAdmin(user);
    await this.dataSource.transaction(async manager => {
      const plan = await manager.findOne(PerformancePlan, { where: { id: planId }, lock: { mode: 'pessimistic_write' } });
      if (!plan) throw new NotFoundException('考评方案不存在');
      const remaining = await manager.countBy(PerformanceRecord, { planId, status: In(['PENDING_SELF','PENDING_MANAGER']) });
      if (remaining) throw new BadRequestException('仍有未完成考评，不能归档');
      plan.status = 'COMPLETED'; await manager.save(plan);
    });
  }

  /**
   * 将绩效考评等级系数一键同步联动至指定月份薪酬核算表
   */
  async syncToSalary(dto: SyncPerformanceToSalaryDto, user?: CurrentUserPayload): Promise<{ updatedCount: number }> {
    requirePermission(user, 'hr:salary:sync');
    requirePermission(user, 'hr:salary:edit');
    const records = await this.scopedRecords(user).andWhere('r.planId = :planId AND r.status = :status', { planId: dto.planId, status: 'COMPLETED' }).getMany();

    if (records.length === 0) {
      throw new BadRequestException('该方案暂无已完成评定的考评记录，无法同步发薪');
    }

    return this.dataSource.transaction(async manager => {
    let updatedCount = 0;
    for (const rec of records) {
      const qb = manager.createQueryBuilder(SalaryRecord, 's').innerJoin(Employee, 'salaryEmp', 'salaryEmp.id = s.empId').where('s.yearMonth = :month AND s.empId = :empId', { month: dto.yearMonth, empId: rec.empId });
      applyScope(qb, user, 'salary', 'salaryEmp.deptId', 's.empId');
      const salary = await qb.setLock('pessimistic_write', undefined, ['s']).getOne();

      if (salary) {
        if (salary.status !== 1) throw new BadRequestException('核准或已发薪资不可同步绩效');
        const coef = Number(rec.coefficient ?? 1.0);
        // 基准绩效工资 * 绩效系数 (默认基准绩效为 baseSalary 的 15%)
        const basePerformance = Math.round(Number(salary.baseSalary) * 0.15);
        const adjustedPerformance = Math.round(basePerformance * coef);

        salary.performanceSalary = adjustedPerformance;
        // 重新计算应发与实发
        const grossSalary =
          Number(salary.baseSalary) +
          Number(salary.postSalary) +
          adjustedPerformance +
          Number(salary.overtimeSalary) +
          Number(salary.allowance);
        salary.grossSalary = grossSalary;

        const totalDeduction =
          Number(salary.leaveDeduction || 0) +
          Number(salary.socialSecurity || 0) +
          Number(salary.housingFund || 0) +
          Number(salary.tax || 0);
        salary.netSalary = Math.max(0, grossSalary - totalDeduction);

        await manager.save(salary);
        updatedCount++;
      }
    }

    return { updatedCount };
    });
  }

  /**
   * 导出考评明细报表为标准 Excel
   */
  async exportReport(res: Response, planId: number, user?: CurrentUserPayload): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    const records = await this.scopedRecords(user).andWhere('r.planId = :planId', { planId }).orderBy('r.id', 'ASC').getMany();

    const columns = [
      { header: '员工工号', key: 'empNo', width: 14 },
      { header: '员工姓名', key: 'empName', width: 14 },
      { header: '部门', key: 'deptName', width: 18 },
      { header: '岗位', key: 'post', width: 18 },
      { header: '员工自评分', key: 'selfScore', width: 14 },
      { header: '自评述职总结', key: 'selfComment', width: 30 },
      { header: '主管考评分', key: 'managerScore', width: 14 },
      { header: '主管评语', key: 'managerComment', width: 30 },
      { header: '综合得分', key: 'finalScore', width: 14 },
      { header: '绩效等级', key: 'rating', width: 12 },
      { header: '绩效系数', key: 'coefficient', width: 12 },
      { header: '状态', key: 'statusText', width: 14 },
      { header: '评定时间', key: 'evaluatedAt', width: 22 },
    ];

    const data = records.map((r) => ({
      empNo: r.empNo,
      empName: r.empName,
      deptName: r.deptName || '-',
      post: r.post || '-',
      selfScore: r.selfScore !== null ? Number(r.selfScore) : '-',
      selfComment: r.selfComment || '-',
      managerScore: r.managerScore !== null ? Number(r.managerScore) : '-',
      managerComment: r.managerComment || '-',
      finalScore: r.finalScore !== null ? Number(r.finalScore) : '-',
      rating: r.rating || '-',
      coefficient: Number(r.coefficient ?? 1).toFixed(2),
      statusText:
        r.status === 'COMPLETED' ? '已完成' : r.status === 'PENDING_MANAGER' ? '待主管评' : '待自评',
      evaluatedAt: r.evaluatedAt ? new Date(r.evaluatedAt).toLocaleString() : '-',
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('绩效考评明细');
    worksheet.columns = columns;
    for (const item of data) {
      worksheet.addRow(item);
    }

    const filename = `${plan?.title || '绩效考评结果报表'}_${Date.now()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}
