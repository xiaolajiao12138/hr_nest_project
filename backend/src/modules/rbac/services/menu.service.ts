import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Menu } from '../entities/menu.entity';
import { BaseService } from '../../../common/base/base.service';
import { User } from '../entities/user.entity';

export interface RouteItem {
  id: number;
  parentId: number;
  path: string;
  name: string;
  component: string;
  meta: {
    title: string;
    icon: string;
    hidden: boolean;
    isFrame: boolean;
  };
  children?: RouteItem[];
}

@Injectable()
export class MenuService extends BaseService<Menu> {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    dataSource: DataSource,
  ) {
    super(menuRepository, dataSource);
  }

  /**
   * 重点：根据用户ID获取当前用户可访问的动态路由树
   * 前端动态 addRoute 挂载路由的数据源
   */
  async getRoutesByUserId(userId: number): Promise<RouteItem[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.menus'],
    });

    if (!user) return [];

    let menus: Menu[] = [];
    const isAdmin = user.roles?.some((r) => r.roleKey === 'admin');

    if (isAdmin) {
      // 超级管理员获取所有正常状态的菜单与目录
      menus = await this.menuRepository.find({
        where: { status: 1 },
        order: { sort: 'ASC', id: 'ASC' },
      });
    } else {
      // 普通角色获取已分配的正常菜单
      const menuMap = new Map<number, Menu>();
      for (const role of user.roles || []) {
        if (role.status === 1 && role.menus) {
          for (const m of role.menus) {
            if (m.status === 1) {
              menuMap.set(m.id, m);
            }
          }
        }
      }
      menus = Array.from(menuMap.values()).sort(
        (a, b) => a.sort - b.sort || a.id - b.id,
      );
    }

    // 过滤出目录(M)和菜单(C)，按钮(F)不属于路由
    const routeMenus = menus.filter((m) => ['M', 'C'].includes(m.menuType));
    return this.buildRouteTree(routeMenus);
  }

  /**
   * 获取用户所有按钮权限标识字符清单
   */
  async getPermissionsByUserId(userId: number): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.menus'],
    });

    if (!user) return [];
    if (user.roles?.some((r) => r.roleKey === 'admin')) {
      return ['*'];
    }

    const permsSet = new Set<string>();
    for (const role of user.roles || []) {
      if (role.status === 1 && role.menus) {
        for (const menu of role.menus) {
          if (menu.perms && menu.perms.trim()) {
            permsSet.add(menu.perms.trim());
          }
        }
      }
    }
    return Array.from(permsSet);
  }

  /**
   * 获取全量菜单树（用于菜单管理页面与角色权限分配）
   */
  async getMenuTree(): Promise<Menu[]> {
    const allMenus = await this.menuRepository.find({
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(allMenus, 0);
  }

  /**
   * 构建路由树结构
   */
  private buildRouteTree(menus: Menu[], parentId = 0): RouteItem[] {
    const tree: RouteItem[] = [];
    for (const item of menus) {
      if (Number(item.parentId) === parentId) {
        const routeNode: RouteItem = {
          id: item.id,
          parentId: item.parentId,
          path: item.path,
          name: item.name || `Route_${item.id}`,
          component: item.component || 'Layout',
          meta: {
            title: item.title,
            icon: item.icon || '',
            hidden: Boolean(item.isHidden),
            isFrame: Boolean(item.isFrame),
          },
        };

        const children = this.buildRouteTree(menus, item.id);
        if (children.length > 0) {
          routeNode.children = children;
        }
        tree.push(routeNode);
      }
    }
    return tree;
  }

  /**
   * 构建标准实体树
   */
  private buildTree(list: Menu[], parentId = 0): Menu[] {
    const result: Menu[] = [];
    for (const item of list) {
      if (Number(item.parentId) === parentId) {
        const children = this.buildTree(list, item.id);
        if (children.length > 0) {
          item.children = children;
        }
        result.push(item);
      }
    }
    return result;
  }
}
