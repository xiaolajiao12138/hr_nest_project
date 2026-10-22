import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { Dept } from '../../department/entities/dept.entity';
import { User } from '../../rbac/entities/user.entity';

@Entity('hr_leave')
export class Leave extends BaseEntity {
  @Column({ name: 'leave_no', length: 50, unique: true, comment: '请假单编号' })
  leaveNo: string;

  @Column({ name: 'emp_id', comment: '申请员工ID' })
  empId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee?: Employee;

  @Column({ name: 'emp_name', length: 50, comment: '员工姓名' })
  empName: string;

  @Column({ name: 'dept_id', nullable: true, comment: '所属部门ID' })
  deptId: number;

  @ManyToOne(() => Dept, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dept_id' })
  dept?: Dept;

  @Column({
    name: 'leave_type',
    length: 20,
    comment: '请假类型: ANNUAL(年假), SICK(病假), CASUAL(事假)',
  })
  leaveType: string;

  @Column({
    name: 'start_time',
    type: 'timestamp with time zone',
    comment: '请假开始时间',
  })
  startTime: Date;

  @Column({
    name: 'end_time',
    type: 'timestamp with time zone',
    comment: '请假结束时间',
  })
  endTime: Date;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    comment: '请假天数',
  })
  days: number;

  @Column({ type: 'text', comment: '请假事由' })
  reason: string;

  @Column({
    length: 20,
    default: 'PENDING',
    comment: '状态: PENDING(待审批), APPROVED(已通过), REJECTED(已驳回)',
  })
  status: string;

  @Column({ name: 'audit_user_id', nullable: true, comment: '审批人ID' })
  auditUserId: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'audit_user_id' })
  auditUser?: User;

  @Column({ name: 'audit_remark', length: 255, nullable: true, comment: '审批批注意见' })
  auditRemark: string;
}
