import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { applyScope, assertScope, assertEmployeeScope, requirePermission, isAdmin } from '../../common/security/data-scope';
import { AuthCacheService } from '../rbac/services/auth-cache.service';
import { Leave } from './entities/leave.entity';
import { AnnualLeave } from './entities/annual.entity';
import { Employee } from '../employee/entities/employee.entity';
import { BaseService } from '../../common/base/base.service';
import {
  CreateLeaveDto,
  AuditLeaveDto,
  QueryLeaveDto,
  QueryAnnualLeaveDto,
  AdjustAnnualLeaveDto,
  InitAnnualLeaveDto,
} from './dto/leave.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { SseService } from '../sse/sse.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 请假审批与年假账户核心业务服务类
 *
 * 核心业务领域：
 * 1. 考勤请假流程多维检索与分页（关联部门、申请人档案、审批人）
 * 2. 员工年假账户额度动态计算与自动初始化
 * 3. 强一致性事务原子场景：提交请假申请时，自动利用悲观锁预扣减年假账户额度，失败整体回滚
 * 4. 强一致性事务原子场景：审批驳回年假申请时，事务内原子归还预扣额度至年假账户
 * 5. SSE 实时事件联动：申请提交与审核完成自动广播待办徽标变动与审批结果提醒
 */
@Injectable()
export class LeaveService extends BaseService<Leave> {
  /**
   * 构造函数注入依赖实体仓储与外部服务
   *
   * @param leaveRepo 请假单实体 Repository
   * @param annualRepo 年假账户额度实体 Repository
   * @param empRepo 员工档案实体 Repository
   * @param dataSource 全局 TypeORM 数据源（用于底层事务驱动）
   * @param sseService 全局 SSE 实时推送服务
   */
  constructor(
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,
    @InjectRepository(AnnualLeave)
    private readonly annualRepo: Repository<AnnualLeave>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    dataSource: DataSource,
    private readonly sseService: SseService,
    private readonly authCacheService: AuthCacheService,
  ) {
    super(leaveRepo, dataSource);
  }

  /**
   * 获取当前系统处于待审批状态 (PENDING) 的请假任务总数
   * 支持权限自适应：
   * 1. 超级管理员 (admin) 或人事审批专员：返回全公司待审批请假总数；
   * 2. 普通员工：返回 0，安全静默放行，杜绝无权限报错
   *
   * @param user 当前登录用户载荷
   * @returns 包含待办数量的对象 { count: number }
   */
  async getPendingCount(user?: CurrentUserPayload): Promise<{ count: number }> {
    if (!user || (!isAdmin(user) && !user.permissions?.includes('hr:leave:audit'))) return { count: 0 };
    const qb = this.leaveRepo.createQueryBuilder('leave').leftJoin('leave.employee', 'emp').where('leave.status = :pending', { pending: 'PENDING' });
    applyScope(qb, user, 'leave', 'emp.deptId', 'leave.empId');
    qb.andWhere('leave.empId IS DISTINCT FROM :self', { self: user.employeeId || null });
    return { count: await qb.getCount() };
  }

  /**
   * 综合分页条件查询请假申请记录列表
   *
   * @param query 过滤条件参数（状态、请假类型、所属部门、综合模糊关键字、分页入参）
   * @returns 分页结果包装对象，包含联表详情与总记录数
   */
  async findLeavePage(query: QueryLeaveDto, user?: CurrentUserPayload): Promise<PageResultDto<Leave>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    // 构建连表查询查询器
    const qb = this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.dept', 'dept')
      .leftJoinAndSelect('leave.auditUser', 'auditUser')
      .leftJoinAndSelect('leave.employee', 'employee')
      .skip(skip)
      .take(pageSize)
      .orderBy('leave.id', 'DESC');

    applyScope(qb, user, 'leave', 'employee.deptId', 'leave.empId');
    // 动态拼接过滤条件
    if (query.status) {
      qb.andWhere('leave.status = :status', { status: query.status });
    }
    if (query.leaveType) {
      qb.andWhere('leave.leaveType = :leaveType', {
        leaveType: query.leaveType,
      });
    }
    if (query.deptId) {
      qb.andWhere('leave.deptId = :deptId', { deptId: query.deptId });
    }
    if (query.keyword) {
      qb.andWhere(
        '(leave.empName LIKE :kw OR leave.leaveNo LIKE :kw OR leave.reason LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    const [list, total] = await qb.getManyAndCount();
    return PageResultDto.create(list, total, page, pageSize);
  }

  /**
   * 检索指定员工在特定年份的年假账户余额（若无则自动初始化）
   *
   * @param empId 员工档案唯一 ID
   * @param year 查询年份（默认当年）
   * @returns 年假账户实体（含总天数、已用天数、剩余天数）
   */
  async getEmployeeAnnualBalance(empId: number, year?: number, user?: CurrentUserPayload) {
    await assertEmployeeScope(this.dataSource, user, 'leave', empId);
    const queryYear = Number(year) || new Date().getFullYear();
    return await this.annualRepo.findOneBy({ empId, year: queryYear }) || { empId, year: queryYear, totalDays: 0, usedDays: 0, remainDays: 0, initialized: false };
  }

  /**
   * 重点事务业务：员工提交请假申请
   *
   * 事务原子性与一致性规则：
   * 1. 强校验员工档案与所在部门存在性；
   * 2. 若申请类型为年假 (ANNUAL)，开启数据库行级悲观排他锁（pessimistic_write）读取当年年假账户；
   * 3. 严格校验剩余年假是否满足申请天数，余额不足直接抛出业务异常阻断并全量回滚；
   * 4. 事务内扣减可用余额，累加已用天数，并创建 PENDING 初始状态的请假单；
   * 5. 事务成功提交后，异步触发 SSE 实时推流广播最新待审批任务数。
   *
   * @param dto 创建请假单入参
   * @returns 创建完成的请假单实体
   * @throws BusinessException 当员工不存在或年假可用额度不足时抛出异常
   */
  async applyLeave(dto: CreateLeaveDto, user?: CurrentUserPayload): Promise<Leave> {
    requirePermission(user, 'hr:leave:add');
    await assertEmployeeScope(this.dataSource, user, 'leave', dto.empId);
    if (dto.empId !== user.employeeId) requirePermission(user, 'hr:leave:audit');
    const start = new Date(dto.startTime), end = new Date(dto.endTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() - start.getTime() > 366 * 86400000 || start.getFullYear() !== end.getFullYear()) throw new BusinessException('请假时间无效，请按年度分别申请');
    dto.days = this.calculateLeaveDays(start, end);
    if (dto.days <= 0) throw new BusinessException('所选区间无工作时间');
    // 校验申请人档案状态
    const emp = await this.empRepo.findOne({
      where: { id: dto.empId },
      relations: ['dept'],
    });

    if (!emp || ![1, 3].includes(emp.status)) {
      throw new BusinessException('申请的员工档案不存在');
    }

    const currentYear = new Date(dto.startTime).getFullYear();
    const leaveNo = `LV${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

    // 进入强事务执行块
    const savedLeave = await this.withTransaction(async (manager) => {
      await manager.findOne(Employee, { where: { id: emp.id }, lock: { mode: 'pessimistic_write' } });
      const overlap = await manager.createQueryBuilder(Leave, 'l').where('l.empId = :empId', { empId: emp.id }).andWhere("l.status IN ('PENDING','APPROVED')").andWhere('l.startTime < :end AND l.endTime > :start', { start, end }).getCount();
      if (overlap) throw new BusinessException('该区间已存在请假申请');
      // 1. 如果是年假，使用悲观行级写锁防止并发超额扣减
      if (dto.leaveType === 'ANNUAL') {
        const annualRecord = await manager.findOne(AnnualLeave, {
          where: { empId: dto.empId, year: currentYear },
          lock: { mode: 'pessimistic_write' },
        });

        if (!annualRecord) {
          throw new BusinessException(
            `该员工在 ${currentYear} 年度无年假账户配置，无法申请年假`,
          );
        }

        const remaining = Number(annualRecord.remainDays);
        const applyDays = Number(dto.days);

        // 额度校验
        if (remaining < applyDays) {
          throw new BusinessException(
            `年假余额不足！当前剩余可用年假为 ${remaining} 天，申请天数为 ${applyDays} 天`,
          );
        }

        // 预先扣减可用额度
        annualRecord.remainDays = Number((remaining - applyDays).toFixed(1));
        annualRecord.usedDays = Number(
          (Number(annualRecord.usedDays) + applyDays).toFixed(1),
        );
        await manager.save(annualRecord);
      }

      // 2. 插入处于待审批状态的请假记录
      const leave = manager.create(Leave, {
        leaveNo,
        empId: emp.id,
        empName: emp.name,
        deptId: emp.deptId,
        leaveType: dto.leaveType,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        days: dto.days,
        reason: dto.reason,
        status: 'PENDING',
      });

      return manager.save(leave);
    });

    // 触发 SSE 定向推送：仅向具备请假审批权限的管理员/主管推送新待办提醒与待办角标更新（不打扰普通员工）
    try {
      const auditorIds = await this.notifyPending(savedLeave);
      this.sseService.sendToUsers(auditorIds, {
        type: 'LEAVE_AUDIT_NOTIFY',
        title: '新请假审批待办',
        message: `员工【${savedLeave.empName}】提交了请假申请(${savedLeave.leaveNo})，天数: ${savedLeave.days}天，等待审批`,
        data: {
          leaveId: savedLeave.id,
          empName: savedLeave.empName,
          days: savedLeave.days,
          status: 'PENDING',
        },
      });
    } catch {
      // 通知异常不阻断主流程
    }

    return savedLeave;
  }

  /**
   * 重点事务业务：主管/人事审批请假单（通过 / 驳回）
   *
   * 事务原子性与回滚机制：
   * 1. 防重复审批校验：确保当前请假单处于待审批 PENDING 状态；
   * 2. 原子状态变更：更新审核状态（APPROVED/REJECTED）、批注意见及审核人 ID；
   * 3. 额度原路退还：若本次审核结果为【驳回】且属于【年假】，在事务内加排他写锁，将扣除的天数原子退回员工账户；
   * 4. 事务提交后，触发 SSE 广播待办徽标递减与申请结果弹窗通知。
   *
   * @param leaveId 请假单 ID
   * @param auditDto 审批入参（审核动作、批注意见）
   * @param auditUserId 执行审批的当前管理员/主管用户 ID
   * @returns 审批后的请假单记录
   * @throws BusinessException 单据不存在或已被审批时抛出
   */
  async auditLeave(
    leaveId: number,
    auditDto: AuditLeaveDto,
    user: CurrentUserPayload,
  ): Promise<Leave> {
    requirePermission(user, 'hr:leave:audit');
    const savedLeave = await this.withTransaction(async (manager) => {
      const leave = await manager.findOne(Leave, { where: { id: leaveId }, lock: { mode: 'pessimistic_write' } });
      if (!leave) throw new BusinessException('请假单不存在');
      await assertEmployeeScope(manager, user, 'leave', leave.empId);
      if (leave.empId === user.employeeId) throw new ForbiddenException('不能审批本人的请假申请');
      if (leave.status !== 'PENDING') throw new BusinessException('该请假单已审批，不能重复操作');
      leave.status = auditDto.action;
      leave.auditRemark = auditDto.auditRemark || '';
      leave.auditUserId = user.userId;

      // 驳回年假原子回滚逻辑：将已扣减的天数全额退回到年假账户
      if (auditDto.action === 'REJECTED' && leave.leaveType === 'ANNUAL') {
        const year = new Date(leave.startTime).getFullYear();
        const annualRecord = await manager.findOne(AnnualLeave, {
          where: { empId: leave.empId, year },
          lock: { mode: 'pessimistic_write' },
        });

        if (annualRecord) {
          const days = Number(leave.days);
          annualRecord.remainDays = Number(
            (Number(annualRecord.remainDays) + days).toFixed(1),
          );
          annualRecord.usedDays = Number(
            Math.max(0, Number(annualRecord.usedDays) - days).toFixed(1),
          );
          await manager.save(annualRecord);
        }
      }

      return manager.save(leave);
    });

    // 触发 SSE 定向推送：审批结果仅通知请假申请员工本人，待办角标仅同步给审批人
    try {
      const actionText = auditDto.action === 'APPROVED' ? '已通过' : '已驳回';
      await this.notifyPending(savedLeave);
      const applicantIds = await this.resolveApplicantUserIds(savedLeave.empId);
      this.sseService.sendToUsers(applicantIds, {
        type: 'LEAVE_AUDIT_NOTIFY',
        title: '请假审批提醒',
        message: `您的请假单(${savedLeave.leaveNo})审批结果：${actionText}${auditDto.auditRemark ? ` (批注: ${auditDto.auditRemark})` : ''}`,
        data: {
          leaveId: savedLeave.id,
          empName: savedLeave.empName,
          action: auditDto.action,
          actionText,
          auditRemark: auditDto.auditRemark,
        },
      });
    } catch {
      // 通知异常不阻断主流程
    }

    return savedLeave;
  }

  /**
   * 根据 ID 查询请假单详情
   * @param id 请假单主键
   */
  async getLeaveDetail(id: number, user?: CurrentUserPayload): Promise<Leave> {
    const leave = await this.leaveRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.dept', 'auditUser'],
    });
    if (!leave) {
      throw new BusinessException('请假单不存在');
    }
    await assertEmployeeScope(this.dataSource, user, 'leave', leave.empId);
    return leave;
  }

  /**
   * 分页查询全员年假额度台账列表
   */
  async findAnnualLeavePage(query: QueryAnnualLeaveDto, user?: CurrentUserPayload): Promise<PageResultDto<any>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const year = query.year || new Date().getFullYear();

    const qb = this.annualRepo
      .createQueryBuilder('annual')
      .leftJoinAndSelect('annual.employee', 'emp')
      .leftJoinAndSelect('emp.dept', 'dept')
      .where('annual.year = :year', { year })
      .orderBy('emp.empNo', 'ASC')
      .addOrderBy('annual.id', 'DESC')
      .skip(skip)
      .take(pageSize);

    applyScope(qb, user, 'leave', 'emp.deptId', 'annual.empId');
    if (query.deptId) {
      qb.andWhere('emp.deptId = :deptId', { deptId: query.deptId });
    }

    if (query.keyword) {
      qb.andWhere('(emp.name LIKE :kw OR emp.empNo LIKE :kw OR emp.post LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    const [list, total] = await qb.getManyAndCount();

    const formattedList = list.map((item) => ({
      id: item.id,
      empId: item.empId,
      empNo: item.employee?.empNo || '-',
      empName: item.employee?.name || '-',
      deptName: item.employee?.dept?.deptName || '-',
      post: item.employee?.post || '-',
      year: item.year,
      totalDays: Number(item.totalDays),
      usedDays: Number(item.usedDays),
      remainDays: Number(item.remainDays),
      remark: item.remark || '',
      updatedAt: item.updatedAt,
    }));

    return PageResultDto.create(formattedList, total, page, pageSize);
  }

  /**
   * HR 管理员手动微调员工年假额度
   */
  async adjustAnnualLeave(dto: AdjustAnnualLeaveDto, user?: CurrentUserPayload): Promise<AnnualLeave> {
    requirePermission(user, 'hr:leave:audit');
    return this.withTransaction(async manager => {
      const record = await manager.findOne(AnnualLeave, { where: { id: dto.id }, lock: { mode: 'pessimistic_write' } });
      if (!record) throw new BusinessException('年假账户不存在');
      await assertEmployeeScope(manager, user, 'leave', record.empId);
      if (dto.totalDays < Number(record.usedDays)) throw new BusinessException('总额度不能小于已用额度');
      record.totalDays = dto.totalDays;
      record.remainDays = Number((dto.totalDays - Number(record.usedDays)).toFixed(1));
      if (dto.remark !== undefined) record.remark = dto.remark;
      return manager.save(record);
    });
  }

  /**
   * 批量为指定年度全员自动开辟初始化年假账户
   */
  async initAnnualLeaveForYear(dto: InitAnnualLeaveDto, user?: CurrentUserPayload): Promise<{ createdCount: number }> {
    requirePermission(user, 'hr:leave:audit');
    const targetYear = dto.year || new Date().getFullYear();
    const defaultDays = dto.defaultDays !== undefined ? Number(dto.defaultDays) : 5.0;

    const qb = this.empRepo.createQueryBuilder('emp').where('emp.status IN (1,3)');
    applyScope(qb, user, 'leave', 'emp.deptId', 'emp.id');
    const employees = await qb.getMany();
    const existing = await this.annualRepo.find({
      where: { year: targetYear },
      select: ['empId'],
    });
    const existingSet = new Set(existing.map((e) => e.empId));

    const toInsert: AnnualLeave[] = [];
    for (const emp of employees) {
      if (!existingSet.has(emp.id)) {
        const item = this.annualRepo.create({
          empId: emp.id,
          year: targetYear,
          totalDays: defaultDays,
          usedDays: 0.0,
          remainDays: defaultDays,
          remark: `系统初始化自动分配 ${defaultDays} 天`,
        });
        toInsert.push(item);
      }
    }

    if (toInsert.length > 0) {
      await this.annualRepo.createQueryBuilder().insert().into(AnnualLeave).values(toInsert).orIgnore().execute();
    }

    return { createdCount: toInsert.length };
  }

  /**
   * 根据员工档案 ID (empId) 解析关联的系统登录账号 userId（用于仅向请假员工本人定向推送审批结果）
   */
  private async resolveApplicantUserIds(empId: number): Promise<number[]> {
    const rows = await this.dataSource.query('SELECT id FROM sys_user WHERE employee_id = $1 AND status = 1', [empId]);
    return rows.map(r => Number(r.id));
  }

  private calculateLeaveDays(start: Date, end: Date): number {
    let hours = 0;
    for (const day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day <= end; day.setDate(day.getDate()+1)) {
      if ([0,6].includes(day.getDay())) continue;
      for (const [from,to] of [[9,12],[13,18]]) {
        const a = new Date(day); a.setHours(from,0,0,0);
        const b = new Date(day); b.setHours(to,0,0,0);
        hours += Math.max(0, Math.min(end.getTime(),b.getTime()) - Math.max(start.getTime(),a.getTime())) / 3600000;
      }
    }
    return Math.ceil(hours / 8 * 2) / 2;
  }

  private async notifyPending(leave: Leave): Promise<number[]> {
    const ids = await this.resolveLeaveAuditorUserIds();
    const targets: number[] = [];
    for (const id of ids) {
      const actor = await this.authCacheService.getUserAuthorities(id);
      if (!actor || actor.status !== 1 || actor.employeeId === leave.empId || (!isAdmin(actor) && !actor.permissions.includes('hr:leave:audit'))) continue;
      const count = await this.getPendingCount(actor);
      this.sseService.sendPendingBadgeUpdate(count.count, [id]);
      try { await assertEmployeeScope(this.dataSource, actor, 'leave', leave.empId); targets.push(id); } catch {}
    }
    return targets;
  }

  /**
   * 解析所有拥有请假审批权限（admin 角色或 hr:leave:audit 权限码）的启用账号 userId
   */
  private async resolveLeaveAuditorUserIds(): Promise<number[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT u.id
       FROM sys_user u
       INNER JOIN sys_user_role ur ON ur.user_id = u.id
       INNER JOIN sys_role r ON r.id = ur.role_id AND r.status = 1
       LEFT JOIN sys_role_menu rm ON rm.role_id = r.id
       LEFT JOIN sys_menu m ON m.id = rm.menu_id AND m.status = 1
       WHERE u.status = 1
         AND (r.role_key = 'admin' OR m.perms = 'hr:leave:audit')`,
    );
    return (rows || []).map((r: any) => Number(r.id)).filter((id: number) => id > 0);
  }
}
