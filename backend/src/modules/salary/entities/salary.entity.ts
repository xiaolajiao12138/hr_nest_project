import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Employee } from '../../employee/entities/employee.entity';

/**
 * 员工月度薪酬核算与发薪记录实体
 */
@Entity('hr_salary_record')
export class SalaryRecord extends BaseEntity {
  @Column({ name: 'emp_id', comment: '关联员工ID' })
  empId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee: Employee;

  @Column({ name: 'year_month', length: 10, comment: '薪资所属月份 (格式 YYYY-MM)' })
  yearMonth: string;

  // ------------------ 收入项 (应发组成) ------------------
  @Column({
    name: 'base_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '基本工资',
  })
  baseSalary: number;

  @Column({
    name: 'post_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '岗位津贴/职务工资',
  })
  postSalary: number;

  @Column({
    name: 'performance_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '绩效考核奖金',
  })
  performanceSalary: number;

  @Column({
    name: 'overtime_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '加班补助',
  })
  overtimeSalary: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '综合生活补贴 (餐补/话补/交补)',
  })
  allowance: number;

  // ------------------ 扣减项 ------------------
  @Column({
    name: 'leave_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '考勤缺勤与事假扣款',
  })
  leaveDeduction: number;

  @Column({
    name: 'social_security',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '个人承担五险社保',
  })
  socialSecurity: number;

  @Column({
    name: 'housing_fund',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '个人住房公积金',
  })
  housingFund: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '个人所得税预扣预缴',
  })
  tax: number;

  // ------------------ 合计项 ------------------
  @Column({
    name: 'gross_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '应发工资合计',
  })
  grossSalary: number;

  @Column({
    name: 'net_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    comment: '实发税后到手工资',
  })
  netSalary: number;

  // ------------------ 状态与凭证 ------------------
  @Column({
    type: 'smallint',
    default: 1,
    comment: '发薪状态 1:核算草稿 2:核准待发 3:已发放',
  })
  status: number;

  @Column({
    name: 'payslip_password',
    length: 128,
    nullable: true,
    comment: '个人工资条独立查看安全口令Hash',
  })
  payslipPassword?: string;

  @Column({ length: 255, nullable: true, comment: '备注说明' })
  remark?: string;
}
