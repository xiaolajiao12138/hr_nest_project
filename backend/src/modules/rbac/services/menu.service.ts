import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Menu } from '../entities/menu.entity';
import { BaseService } from '../../../common/base/base.service';
import { User } from '../entities/user.entity';
import { AuthCacheService } from './auth-cache.service';
import { SseService } from '../../sse/sse.service';

/**
 * 前端 Vue Router 路由结构项接口
 */
export interface RouteItem {
  /** 菜单项唯一主键 ID */
  id: number;
  /** 父级节点 ID (0 表示根目录) */
  parentId: number;
  /** 路由访问路径 URL */
  path: string;
  /** 路由具名标识 Name */
  name: string;
  /** 组件映射标识 (如 Layout 或具体 views 文件相对路径) */
  component: string;
  /** 路由元信息 Meta */
  meta: {
    title: string;
    icon: string;
    hidden: boolean;
    isFrame: boolean;
  };
  /** 子路由数组 */
  children?: RouteItem[];
}

/**
 * 系统菜单与权限路由核心业务服务类
 * 
 * 核心业务领域：
 * 1. 动态路由驱动：根据用户绑定的角色与权限，动态生成树状路由元数据（供前端 addRoute 挂载）
 * 2. 按钮权限清洗：聚合去重生成用户持有的权限字符集（如 `hr:leave:audit`），超管返回 `['*']`
 * 3. 菜单管理拓扑：递归构建目录(M)、菜单(C)、按钮(F)全量权限拓扑树供权限分配
 */
@Injectable()
export class MenuService extends BaseService<Menu> {
  /**
   * 构造函数注入菜单仓储与用户仓储
   * 
   * @param menuRepository 菜单实体 Repository
   * @param userRepository 用户实体 Repository
   * @param dataSource TypeORM 数据源
   */
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authCacheService: AuthCacheService,
    private readonly sseService: SseService,
    dataSource: DataSource,
  ) {
    super(menuRepository, dataSource);
  }

  /**
   * 重写新增菜单
   */
  async create(attrs: any): Promise<Menu> {
    const created = await super.create(attrs);
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('系统功能菜单与权限树已更新');
    return created;
  }

  /**
   * 重写编辑菜单
   */
  async update(id: number, attrs: any): Promise<Menu> {
    const updated = await super.update(id, attrs);
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('系统功能菜单与权限树已更新');
    return updated;
  }

  /**
   * 重写删除菜单
   */
  async deleteById(id: number): Promise<boolean> {
    const res = await super.deleteById(id);
    await this.authCacheService.clearAllAuthorities();
    this.sseService.broadcastPermissionUpdate('系统功能菜单与权限树已更新');
    return res;
  }

  /**
   * 重点特性：根据用户主键 ID 获取当前账号有权访问的动态路由树
   * （前端动态路由 addRoute 与侧边栏菜单的数据源）
   * 
   * 权限过滤规则：
   * 1. 若当前用户角色包含 `admin`，直接拉取系统全部正常状态的目录与菜单；
   * 2. 若为普通角色，递归遍历其分配的所有启用角色所包含的菜单，使用 Map 按 ID 去重；
   * 3. 过滤只保留目录(M)和菜单(C)，排除无视图的按钮(F)权限项；
   * 4. 递归组装为标准的 RouteItem 嵌套树形结构。
   * 
   * @param userId 操作人用户 ID
   * @returns 动态路由树数组
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
      // 超级管理员直接获取所有正常状态的菜单与目录
      menus = await this.menuRepository.find({
        where: { status: 1 },
        order: { sort: 'ASC', id: 'ASC' },
      });
    } else {
      // 普通角色按已分配的菜单并集去重汇总
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

    // 过滤出目录(M)和菜单(C)，按钮(F)仅为操作权限不属于页面路由
    const routeMenus = menus.filter((m) => ['M', 'C'].includes(m.menuType));
    return this.buildRouteTree(routeMenus);
  }

  /**
   * 提取当前用户拥有的所有细粒度按钮权限标识字符串清单（供前端 v-hasPerm 指令使用）
   * 
   * @param userId 用户主键 ID
   * @returns 权限标识字符串数组（超管直接返回 ['*']）
   */
  async getPermissionsByUserId(userId: number): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.menus'],
    });

    if (!user) return [];
    // 超级管理员拥有全局特权通配符
    if (user.roles?.some((r) => r.roleKey === 'admin')) {
      return ['*'];
    }

    // 普通用户多角色权限去重聚合
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
   * 获取全量系统菜单实体树（用于「菜单管理」列表及「角色赋权」弹窗）
   * 
   * @returns 全量包含按钮的完整树形结构
   */
  async getMenuTree(): Promise<Menu[]> {
    const allMenus = await this.menuRepository.find({
      order: { sort: 'ASC', id: 'ASC' },
    });
    return this.buildTree(allMenus, 0);
  }

  /**
   * 递归组装路由节点树
   * 
   * @param menus 待转换的菜单实体数组
   * @param parentId 父节点标识
   * @returns 路由项树
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

        // 递归挂载子分支路由
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
   * 递归构建标准菜单实体树
   * 
   * @param list 扁平菜单实体数组
   * @param parentId 父级主键
   * @returns 嵌套树状数组
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
