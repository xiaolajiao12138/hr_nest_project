import { Entity, Column, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { Role } from './role.entity';

@Entity('sys_menu')
export class Menu extends BaseEntity {
  @Column({ name: 'parent_id', default: 0, comment: '父菜单ID' })
  parentId: number;

  @Column({ length: 50, comment: '菜单/路由标题' })
  title: string;

  @Column({ length: 50, nullable: true, comment: '路由唯一英文名(用于KeepAlive和跳转)' })
  name: string;

  @Column({ length: 100, comment: '路由地址' })
  path: string;

  @Column({ length: 150, nullable: true, comment: '前端组件路径(如 views/system/user/index.vue 或 Layout)' })
  component: string;

  @Column({ length: 50, default: '', comment: '图标' })
  icon: string;

  @Column({ default: 0, comment: '显示排序' })
  sort: number;

  @Column({ name: 'menu_type', length: 1, default: 'C', comment: 'M目录, C菜单, F按钮' })
  menuType: string;

  @Column({ length: 100, nullable: true, comment: '按钮权限标识，如 hr:employee:add' })
  perms: string;

  @Column({ name: 'is_frame', default: false, comment: '是否为外链' })
  isFrame: boolean;

  @Column({ name: 'is_hidden', default: false, comment: '是否在侧边栏隐藏' })
  isHidden: boolean;

  @Column({ type: 'smallint', default: 1, comment: '状态 1:正常 0:停用' })
  status: number;

  @ManyToMany(() => Role, (role) => role.menus)
  roles: Role[];

  // 虚拟树形子节点字段
  children?: Menu[];
}
