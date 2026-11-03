import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { Role } from './role.entity';
import { BaseEntity } from '../../../common/base/base.entity';
import { Dept } from '../../department/entities/dept.entity';
import { Employee } from '../../employee/entities/employee.entity';

@Entity('sys_user')
export class User extends BaseEntity {
  @Column({ length: 50, unique: true, comment: '登录用户名' })
  username: string;

  @Column({ length: 100, select: false, comment: '密码散列' })
  password: string;

  @Column({ length: 50, default: '', select: false, comment: '盐值' })
  salt: string;

  @Column({ name: 'real_name', length: 50, comment: '真实姓名' })
  realName: string;

  @Column({ length: 20, nullable: true, comment: '联系手机' })
  phone: string;

  @Column({ length: 50, nullable: true, comment: '邮箱' })
  email: string;

  @Column({ length: 255, default: '', comment: '头像地址' })
  avatar: string;

  @Column({ name: 'dept_id', nullable: true, comment: '所属部门ID' })
  deptId: number;

  @Column({ name: 'employee_id', type: 'integer', nullable: true, unique: true, comment: '可信员工身份绑定' })
  employeeId: number | null;

  @OneToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee;

  @ManyToOne(() => Dept, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dept_id' })
  dept?: Dept;

  @Column({ type: 'smallint', default: 1, comment: '状态 1:正常 0:停用' })
  status: number;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'sys_user_role',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: Role[];
}
