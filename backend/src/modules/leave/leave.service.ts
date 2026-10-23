import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Leave } from './entities/leave.entity';
import { AnnualLeave } from './entities/annual.entity';
import { Employee } from '../employee/entities/employee.entity';
import { BaseService } from '../../common/base/base.service';
import { CreateLeaveDto, AuditLeaveDto, QueryLeaveDto } from './dto/leave.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PageResultDto } from '../../common/dto/page-result.dto';
import { SseService } from '../sse/sse.service';

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
  ) {
    super(leaveRepo, dataSource);
  }

  /**
   * 获取当前系统处于待审批状态 (PENDING) 的请假任务总数
   * 
   * @returns 包含待办数量的对象 { count: number }
   */
  async getPendingCount(): Promise<{ count: number }> {
    const count = await this.leaveRepo.count({ where: { status: 'PENDING' } });
    return { count };
  }

  /**
   * 综合分页条件查询请假申请记录列表
   * 
   * @param query 过滤条件参数（状态、请假类型、所属部门、综合模糊关键字、分页入参）
   * @returns 分页结果包装对象，包含联表详情与总记录数
   */
  async findLeavePage(query: QueryLeaveDto): Promise<PageResultDto<Leave>> {
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
  async getEmployeeAnnualBalance(empId: number, year?: number) {
    const queryYear = year || new Date().getFullYear();
    let balance = await this.annualRepo.findOne({
      where: { empId, year: queryYear },
    });

    // 若无该年度记录，自动按基准额度 5.0 天开户初始化
    if (!balance) {
      balance = this.annualRepo.create({
        empId,
        year: queryYear,
        totalDays: 5.0,
        usedDays: 0.0,
        remainDays: 5.0,
      });
      await this.annualRepo.save(balance);
    }

    return balance;
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
  async applyLeave(dto: CreateLeaveDto): Promise<Leave> {
    // 校验申请人档案状态
    const emp = await this.empRepo.findOne({
      where: { id: dto.empId },
      relations: ['dept'],
    });

    if (!emp) {
      throw new BusinessException('申请的员工档案不存在');
    }

    const currentYear = new Date(dto.startTime).getFullYear();
    const leaveNo = `LV${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

    // 进入强事务执行块
    const savedLeave = await this.withTransaction(async (manager) => {
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

    // 触发 SSE 实时推送：更新全员待办审批徽标数字
    this.leaveRepo.count({ where: { status: 'PENDING' } }).then((pendingCount) => {
      this.sseService.sendPendingBadgeUpdate(pendingCount);
    }).catch(() => {});

    // 触发 SSE 实时推送：新请假待办提交通知
    this.sseService.broadcast({
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
    auditUserId: number,
  ): Promise<Leave> {
    const leave = await this.leaveRepo.findOne({
      where: { id: leaveId },
    });

    if (!leave) {
      throw new BusinessException('请假单不存在');
    }

    if (leave.status !== 'PENDING') {
      throw new BusinessException('该请假单已被审批处理，无法重复操作');
    }

    // 开启审批事务
    const savedLeave = await this.withTransaction(async (manager) => {
      leave.status = auditDto.action;
      leave.auditRemark = auditDto.auditRemark || '';
      leave.auditUserId = auditUserId;

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

    // 触发 SSE 实时推送：更新全员待办审批徽标数字
    this.leaveRepo.count({ where: { status: 'PENDING' } }).then((pendingCount) => {
      this.sseService.sendPendingBadgeUpdate(pendingCount);
    }).catch(() => {});

    // 触发 SSE 实时推送：审批结果提醒通知
    const actionText = auditDto.action === 'APPROVED' ? '已通过' : '已驳回';
    this.sseService.broadcast({
      type: 'LEAVE_AUDIT_NOTIFY',
      title: '请假审批提醒',
      message: `员工【${savedLeave.empName}】的请假单(${savedLeave.leaveNo})审批结果：${actionText}${auditDto.auditRemark ? ` (批注: ${auditDto.auditRemark})` : ''}`,
      data: {
        leaveId: savedLeave.id,
        empName: savedLeave.empName,
        action: auditDto.action,
        actionText,
        auditRemark: auditDto.auditRemark,
      },
    });

    return savedLeave;
  }
}
