import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Dept } from '../../department/entities/dept.entity';
import { SysFile } from '../../../upload/entities/file.entity';

@Entity('hr_employee')
export class Employee extends BaseEntity {
  @Column({ name: 'emp_no', length: 30, unique: true, comment: '员工工号' })
  empNo: string;

  @Column({ length: 50, comment: '姓名' })
  name: string;

  @Column({ length: 10, default: '男', comment: '性别' })
  gender: string;

  @Column({ length: 20, comment: '手机号码' })
  phone: string;

  @Column({ name: 'id_card', length: 30, comment: '身份证号' })
  idCard: string;

  @Column({ name: 'id_card_front_id', nullable: true, comment: '身份证人像面附件ID' })
  idCardFrontId: number;

  @ManyToOne(() => SysFile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_card_front_id' })
  idCardFront?: SysFile;

  @Column({ name: 'id_card_back_id', nullable: true, comment: '身份证国徽面附件ID' })
  idCardBackId: number;

  @ManyToOne(() => SysFile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_card_back_id' })
  idCardBack?: SysFile;

  @Column({ name: 'edu_cert_id', nullable: true, comment: '学历证明附件ID' })
  eduCertId: number;

  @ManyToOne(() => SysFile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'edu_cert_id' })
  eduCert?: SysFile;

  @Column({ name: 'entry_date', type: 'date', comment: '入职日期' })
  entryDate: string;

  @Column({ length: 50, comment: '岗位职位' })
  post: string;

  @Column({ name: 'dept_id', comment: '所属部门ID' })
  deptId: number;

  @ManyToOne(() => Dept, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dept_id' })
  dept: Dept;

  @Column({ length: 20, default: '本科', comment: '学历' })
  education: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0.0, comment: '薪资' })
  salary: number;

  @Column({ type: 'smallint', default: 1, comment: '状态 1:在职 2:离职 3:试用期' })
  status: number;

  @Column({ length: 255, nullable: true, comment: '备注说明' })
  remark: string;
}
