import {
  Entity,
  Column,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Menu } from './menu.entity';
import { User } from './user.entity';

@Entity('sys_role')
export class Role extends BaseEntity {
  @Column({ name: 'role_name', length: 50, comment: '角色名称' })
  roleName: string;

  @Column({ name: 'role_key', length: 50, unique: true, comment: '角色权限标识，如 admin, hr' })
  roleKey: string;

  @Column({ default: 0, comment: '显示顺序' })
  sort: number;

  @Column({ type: 'smallint', default: 1, comment: '角色状态 1:正常 0:停用' })
  status: number;

  @Column({ length: 255, nullable: true, comment: '备注' })
  remark: string;

  @ManyToMany(() => Menu, (menu) => menu.roles)
  @JoinTable({
    name: 'sys_role_menu',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'menu_id', referencedColumnName: 'id' },
  })
  menus: Menu[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
