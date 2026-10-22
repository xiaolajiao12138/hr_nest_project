import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

@Entity('sys_dept')
export class Dept extends BaseEntity {
  @Column({ name: 'parent_id', default: 0, comment: '父部门ID' })
  parentId: number;

  @Column({ name: 'dept_name', length: 50, comment: '部门名称' })
  deptName: string;

  @Column({ length: 50, nullable: true, comment: '负责人' })
  leader: string;

  @Column({ length: 20, nullable: true, comment: '联系电话' })
  phone: string;

  @Column({ length: 50, nullable: true, comment: '邮箱' })
  email: string;

  @Column({ default: 0, comment: '显示排序' })
  sort: number;

  @Column({ type: 'smallint', default: 1, comment: '状态 1:正常 0:停用' })
  status: number;

  // 虚拟树形子节点字段（不映射数据库列）
  children?: Dept[];
}
