import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { AttendanceShift } from './shift.entity';

/**
 * 员工考勤排班记录实体 (hr_attendance_schedule)
 */
@Entity('hr_attendance_schedule')
export class AttendanceSchedule extends BaseEntity {
  @Column({ name: 'emp_id', comment: '关联员工ID' })
  empId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee: Employee;

  @Column({ type: 'date', comment: '排班具体日期 (YYYY-MM-DD)' })
  date: string;

  @Column({ name: 'shift_id', nullable: true, comment: '班次ID' })
  shiftId?: number;

  @ManyToOne(() => AttendanceShift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift?: AttendanceShift;

  @Column({ name: 'is_rest', default: false, comment: '是否排休' })
  isRest: boolean;
}
