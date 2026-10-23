import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Employee } from '../../employee/entities/employee.entity';

@Entity('hr_annual')
export class AnnualLeave extends BaseEntity {
  @Column({ name: 'emp_id', comment: '员工ID' })
  empId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee?: Employee;

  @Column({ comment: '年份' })
  year: number;

  @Column({
    name: 'total_days',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 5.0,
    comment: '总年假天数',
  })
  totalDays: number;

  @Column({
    name: 'used_days',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 0.0,
    comment: '已使用天数',
  })
  usedDays: number;

  @Column({
    name: 'remain_days',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 5.0,
    comment: '剩余可用天数',
  })
  remainDays: number;

  @Column({ length: 255, nullable: true, comment: '备注说明或调整记录' })
  remark?: string;
}
