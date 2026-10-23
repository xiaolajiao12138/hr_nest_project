import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

/**
 * 绩效考评方案与周期实体
 */
@Entity('hr_performance_plan')
export class PerformancePlan extends BaseEntity {
  @Column({ length: 100, comment: '考核方案名称' })
  title: string;

  @Column({
    name: 'cycle_type',
    length: 20,
    default: 'QUARTERLY',
    comment: '周期类型: MONTHLY/QUARTERLY/ANNUAL',
  })
  cycleType: string;

  @Column({
    name: 'start_date',
    type: 'varchar',
    length: 20,
    comment: '考核起始日期 (YYYY-MM-DD)',
  })
  startDate: string;

  @Column({
    name: 'end_date',
    type: 'varchar',
    length: 20,
    comment: '考核截止日期 (YYYY-MM-DD)',
  })
  endDate: string;

  @Column({
    name: 'weight_self',
    type: 'int',
    default: 30,
    comment: '员工自评权重百分比(%)',
  })
  weightSelf: number;

  @Column({
    name: 'weight_manager',
    type: 'int',
    default: 70,
    comment: '主管考评权重百分比(%)',
  })
  weightManager: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'KPI/OKR指标库模板配置JSON',
  })
  metrics: string;

  @Column({
    length: 20,
    default: 'IN_PROGRESS',
    comment: '方案状态: DRAFT-草稿, IN_PROGRESS-进行中, COMPLETED-已归档',
  })
  status: string;

  @Column({ length: 255, nullable: true, comment: '备注说明' })
  remark: string;
}
