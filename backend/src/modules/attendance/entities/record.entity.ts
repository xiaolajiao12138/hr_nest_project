import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { AttendanceShift } from './shift.entity';

/**
 * 考勤打卡明细与综合判定实体 (hr_attendance_record)
 */
@Entity('hr_attendance_record')
export class AttendanceRecord extends BaseEntity {
  @Column({ name: 'emp_id', comment: '关联员工ID' })
  empId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee: Employee;

  @Column({ type: 'date', comment: '考勤日期 (YYYY-MM-DD)' })
  date: string;

  @Column({
    name: 'check_in_time',
    type: 'timestamp with time zone',
    nullable: true,
    comment: '上班实际打卡时间',
  })
  checkInTime?: Date;

  @Column({
    name: 'check_out_time',
    type: 'timestamp with time zone',
    nullable: true,
    comment: '下班实际打卡时间',
  })
  checkOutTime?: Date;

  @Column({ name: 'shift_id', nullable: true, comment: '匹配的班次ID' })
  shiftId?: number;

  @ManyToOne(() => AttendanceShift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift?: AttendanceShift;

  @Column({
    name: 'check_in_status',
    default: 3,
    comment: '上班打卡判定 1:正常 2:迟到 3:缺卡',
  })
  checkInStatus: number;

  @Column({
    name: 'check_out_status',
    default: 3,
    comment: '下班打卡判定 1:正常 2:早退 3:缺卡',
  })
  checkOutStatus: number;

  @Column({
    default: 4,
    comment: '全天综合状态 1:正常 2:迟到 3:早退 4:旷工/严重缺卡 5:请假中 6:休息',
  })
  status: number;

  @Column({
    name: 'work_hours',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 0,
    comment: '实际出勤工时(小时)',
  })
  workHours: number;

  @Column({ name: 'check_in_ip', length: 50, nullable: true, comment: '上班打卡IP' })
  checkInIp?: string;

  @Column({ name: 'check_out_ip', length: 50, nullable: true, comment: '下班打卡IP' })
  checkOutIp?: string;

  @Column({ length: 255, nullable: true, comment: '考勤备注/补卡修正原因' })
  remark?: string;
}
