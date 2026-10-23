import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

/**
 * 考勤班次规则配置实体 (hr_attendance_shift)
 */
@Entity('hr_attendance_shift')
export class AttendanceShift extends BaseEntity {
  @Column({ length: 50, comment: '班次名称 (如标准班 09:00-18:00)' })
  name: string;

  @Column({ name: 'start_time', length: 10, comment: '标准上班时间 (HH:mm)' })
  startTime: string;

  @Column({ name: 'end_time', length: 10, comment: '标准下班时间 (HH:mm)' })
  endTime: string;

  @Column({ name: 'late_tolerance', default: 10, comment: '允许迟到弹性分钟数' })
  lateTolerance: number;

  @Column({ name: 'early_tolerance', default: 0, comment: '允许早退弹性分钟数' })
  earlyTolerance: number;

  @Column({
    name: 'work_hours',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 8.0,
    comment: '标准有效计薪工时',
  })
  workHours: number;

  @Column({ name: 'is_default', default: false, comment: '是否为系统默认排班' })
  isDefault: boolean;

  @Column({ default: 1, comment: '状态 1:启用 0:停用' })
  status: number;

  @Column({ length: 255, nullable: true, comment: '班次规则说明' })
  remark?: string;
}
