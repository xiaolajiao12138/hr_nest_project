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

@Injectable()
export class LeaveService extends BaseService<Leave> {
  constructor(
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,
    @InjectRepository(AnnualLeave)
    private readonly annualRepo: Repository<AnnualLeave>,
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    dataSource: DataSource,
  ) {
    super(leaveRepo, dataSource);
  }

  /**
   * 分页查询请假记录
   */
  async findLeavePage(query: QueryLeaveDto): Promise<PageResultDto<Leave>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const qb = this.leaveRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.dept', 'dept')
      .leftJoinAndSelect('leave.auditUser', 'auditUser')
      .leftJoinAndSelect('leave.employee', 'employee')
      .skip(skip)
      .take(pageSize)
      .orderBy('leave.id', 'DESC');

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
   * 获取员工当年年假可用余额
   */
  async getEmployeeAnnualBalance(empId: number, year?: number) {
    const queryYear = year || new Date().getFullYear();
    let balance = await this.annualRepo.findOne({
      where: { empId, year: queryYear },
    });

    if (!balance) {
      // 默认初始化
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
   * 重点事务场景：提交请假申请
   * 规则：新增请假记录 和 更新员工年假余额 放在同一个数据库事务，两个操作原子化，任一操作失败整体回滚
   */
  async applyLeave(dto: CreateLeaveDto): Promise<Leave> {
    const emp = await this.empRepo.findOne({
      where: { id: dto.empId },
      relations: ['dept'],
    });

    if (!emp) {
      throw new BusinessException('申请的员工档案不存在');
    }

    const currentYear = new Date(dto.startTime).getFullYear();
    const leaveNo = `LV${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

    return this.withTransaction(async (manager) => {
      // 1. 如果是年假，强校验并预扣减/冻结年假余额
      if (dto.leaveType === 'ANNUAL') {
        const annualRecord = await manager.findOne(AnnualLeave, {
          where: { empId: dto.empId, year: currentYear },
          lock: { mode: 'pessimistic_write' }, // 悲观锁防并发扣减
        });

        if (!annualRecord) {
          throw new BusinessException(
            `该员工在 ${currentYear} 年度无年假账户配置，无法申请年假`,
          );
        }

        const remaining = Number(annualRecord.remainDays);
        const applyDays = Number(dto.days);

        if (remaining < applyDays) {
          throw new BusinessException(
            `年假余额不足！当前剩余可用年假为 ${remaining} 天，申请天数为 ${applyDays} 天`,
          );
        }

        // 扣减剩余年假，累加已用天数
        annualRecord.remainDays = Number((remaining - applyDays).toFixed(1));
        annualRecord.usedDays = Number(
          (Number(annualRecord.usedDays) + applyDays).toFixed(1),
        );
        await manager.save(annualRecord);
      }

      // 2. 插入请假单记录
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
  }

  /**
   * 重点事务场景：审批请假申请（通过 / 驳回）
   * 规则：若驳回年假，事务内原子归还之前扣减的年假天数
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

    return this.withTransaction(async (manager) => {
      leave.status = auditDto.action;
      leave.auditRemark = auditDto.auditRemark || '';
      leave.auditUserId = auditUserId;

      // 如果请假被驳回且为年假，将已预扣的年假归还到员工年假余额
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
  }
}
