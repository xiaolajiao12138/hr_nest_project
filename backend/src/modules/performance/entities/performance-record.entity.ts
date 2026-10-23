import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

/**
 * 员工绩效考评明细与闭环评定记录实体
 */
@Entity('hr_performance_record')
export class PerformanceRecord extends BaseEntity {
  @Index()
  @Column({ name: 'plan_id', comment: '关联考核方案ID' })
  planId: number;

  @Index()
  @Column({ name: 'emp_id', comment: '关联员工ID' })
  empId: number;

  @Column({ name: 'emp_name', length: 50, comment: '员工姓名' })
  empName: string;

  @Column({ name: 'emp_no', length: 50, comment: '员工工号' })
  empNo: string;

  @Column({ name: 'dept_id', nullable: true, comment: '部门ID' })
  deptId: number;

  @Column({ name: 'dept_name', length: 50, nullable: true, comment: '部门名称' })
  deptName: string;

  @Column({ length: 50, nullable: true, comment: '岗位职位' })
  post: string;

  @Column({
    name: 'self_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    comment: '员工自评分数(0-100)',
  })
  selfScore: number;

  @Column({
    name: 'self_comment',
    type: 'text',
    nullable: true,
    comment: '员工自评总结述职',
  })
  selfComment: string;

  @Column({
    name: 'manager_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    comment: '主管考评分数(0-100)',
  })
  managerScore: number;

  @Column({
    name: 'manager_comment',
    type: 'text',
    nullable: true,
    comment: '主管评语与成长建议',
  })
  managerComment: string;

  @Column({
    name: 'final_score',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
    comment: '加权综合最终得分(0-100)',
  })
  finalScore: number;

  @Column({
    length: 10,
    nullable: true,
    comment: '绩效等级: S(卓越)/A(优秀)/B(良好)/C(需改进)/D(不合格)',
  })
  rating: string;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 1.0,
    comment: '绩效系数 (如 S:1.5, A:1.2, B:1.0, C:0.8, D:0.0)',
  })
  coefficient: number;

  @Column({
    length: 25,
    default: 'PENDING_SELF',
    comment: '考评状态: PENDING_SELF(待自评), PENDING_MANAGER(待主管评), COMPLETED(已评定)',
  })
  status: string;

  @Column({
    name: 'evaluated_at',
    type: 'timestamp with time zone',
    nullable: true,
    comment: '最终完成评定时间',
  })
  evaluatedAt: Date;
}
