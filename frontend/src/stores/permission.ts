import { defineStore } from 'pinia';
import { RouteRecordRaw } from 'vue-router';
import { getDynamicRoutesApi } from '@/api/auth';
import Layout from '@/layout/index.vue';
import { ElNotification } from 'element-plus';

/**
 * 基于 Vite 的 import.meta.glob 机制预先扫描 views 目录下的所有 Vue 单文件组件
 * 用于动态路由配置中根据后端返回的组件文件路径字符串映射实际的异步加载函数
 */
const modules = import.meta.glob('../views/**/*.vue');

/**
 * 动态路由权限与侧边栏菜单管理 Store
 * 负责从后端拉取当前登录人具备权限的菜单树，转换为 Vue-Router 规范路由记录，并挂载至路由实例
 */
export const usePermissionStore = defineStore('permission', {
  state: () => ({
    /** 当前用户动态追加注册的所有路由记录集合 */
    routes: [] as RouteRecordRaw[],
    /** 用于渲染左侧自适应侧边栏的树形菜单数据源 */
    sidebarMenus: [] as any[],
    /** 标识当前应用生命周期内是否已经完成动态路由挂载（防止路由守卫死循环触发） */
    isRoutesLoaded: false,
    /** 当前已挂载的动态路由名称清单，用于热重载时精准卸载 */
    registeredRouteNames: [] as string[],
  }),

  actions: {
    /**
     * 向后端请求当前用户所属角色的菜单树，并转换为可直接被 Vue-Router 消费的 RouteRecordRaw 集合
     *
     * @returns 返回解析完成的动态路由记录数组
     */
    async generateRoutes(): Promise<RouteRecordRaw[]> {
      const serverRoutes: any = (await getDynamicRoutesApi()) || [];

      // 首页工作台保底：无论角色如何配置菜单，确保 /dashboard 基础工作台始终可访问
      const hasDashboard = serverRoutes.some(
        (m: any) => m.path === '/dashboard' || m.name === 'Dashboard',
      );
      if (!hasDashboard) {
        serverRoutes.unshift({
          id: 1,
          parentId: 0,
          path: '/dashboard',
          name: 'Dashboard',
          component: 'views/dashboard/index.vue',
          meta: {
            title: '工作台',
            icon: 'Odometer',
            hidden: false,
            isFrame: false,
          },
        });
      }

      this.sidebarMenus = serverRoutes;

      // 递归将后端元数据结构转换为 Vue Router 格式
      const accessedRoutes = this.transformRoutes(serverRoutes);

      this.routes = accessedRoutes;
      this.isRoutesLoaded = true;
      return accessedRoutes;
    },

    /**
     * 递归转换后端菜单结构为 Vue-Router 标准 RouteRecordRaw 路由记录
     * 针对顶级独立页面（如工作台），自动注入 Layout 外层骨架，保证侧边栏与顶部导航正常显示
     *
     * @param asyncRoutes 后端返回的多级菜单节点列表
     * @param isRoot 是否为路由树的最顶层节点，默认为 true
     * @returns 返回标准化路由对象数组
     */
    transformRoutes(asyncRoutes: any[], isRoot = true): RouteRecordRaw[] {
      const res: RouteRecordRaw[] = [];

      for (const item of asyncRoutes) {
        // 根据 component 标识匹配真实组件加载器
        let viewComponent: any = null;
        if (item.component === 'Layout') {
          viewComponent = Layout;
        } else if (item.component) {
          // 统一去除首部斜杠并补齐 views/ 前缀，以便精准命中 glob 映射字典
          let compPath = item.component.replace(/^\//, '');
          if (!compPath.startsWith('views/')) {
            compPath = `views/${compPath}`;
          }
          const moduleKey = `../${compPath}`;

          if (modules[moduleKey]) {
            viewComponent = modules[moduleKey];
          } else {
            console.warn(`[动态路由] 未找到组件路径: ${moduleKey}`);
            // 路径配置错误时降级为 404 占位视图，防止整个系统白屏崩溃
            viewComponent = () => import('@/views/404.vue');
          }
        }

        const meta = {
          title: item.meta?.title || '',
          icon: item.meta?.icon || '',
          hidden: Boolean(item.meta?.hidden),
          isFrame: Boolean(item.meta?.isFrame),
        };

        // 核心处理：若为根级非 Layout 的独立页面（例如首页面板工作台 /dashboard）
        // 自动在外层包装顶级 Layout 容器，并赋予唯一具名标识，确保热重载 removeRoute 时连同外层容器一并卸载，杜绝残留空壳 Layout 导致白屏
        if (isRoot && item.component !== 'Layout') {
          const childName = item.name || `Route_${item.id}`;
          res.push({
            path: item.path,
            name: `${childName}__Root`,
            component: Layout,
            children: [
              {
                path: '',
                name: childName,
                component: viewComponent || (() => import('@/views/404.vue')),
                meta,
              },
            ],
          } as RouteRecordRaw);
          continue;
        }

        // 常规目录容器或多级子路由节点
        const routeRecord: any = {
          path: item.path,
          name: item.name,
          component: viewComponent,
          meta,
        };

        // 递归处理子路由集合
        if (item.children && item.children.length > 0) {
          routeRecord.children = this.transformRoutes(item.children, false);
        }

        res.push(routeRecord as RouteRecordRaw);
      }

      return res;
    },

    /**
     * 递归判断目标路由路径是否存在于最新的已授权菜单树中
     */
    checkPathAccess(menus: any[], targetPath: string): boolean {
      if (!menus || menus.length === 0) return false;
      for (const item of menus) {
        if (item.path === targetPath) return true;
        if (item.children && item.children.length > 0) {
          if (this.checkPathAccess(item.children, targetPath)) return true;
        }
      }
      return false;
    },

    /**
     * 递归收集路由树中所有具名路由标识，并统一挂载动态路由、根路径重定向与 404 兜底路由
     */
    mountRoutesToRouter(router: any, accessedRoutes: RouteRecordRaw[]) {
      const recordNames = (list: RouteRecordRaw[]) => {
        for (const r of list) {
          if (r.name) {
            this.registeredRouteNames.push(String(r.name));
          }
          if (r.children && r.children.length > 0) {
            recordNames(r.children);
          }
        }
      };

      for (const route of accessedRoutes) {
        router.addRoute(route);
      }
      recordNames(accessedRoutes);

      // 确保根路径重定向至工作台始终存在
      router.addRoute({
        path: '/',
        name: 'RootRedirect',
        redirect: '/dashboard',
      });
      this.registeredRouteNames.push('RootRedirect');

      // 确保 404 兜底路由始终置于最后
      router.addRoute({
        path: '/:pathMatch(.*)*',
        name: 'DynamicCatchAll',
        redirect: '/404',
      });
      this.registeredRouteNames.push('DynamicCatchAll');
    },

    /**
     * 实时无感热重载动态路由与侧边栏（无需退出重新登录）
     */
    async reloadRoutes(router?: any): Promise<RouteRecordRaw[]> {
      // 1. 先按外层父级到子级完整移除已注册的旧动态路由，杜绝空壳父路由残留
      if (router && this.registeredRouteNames.length > 0) {
        for (const name of this.registeredRouteNames) {
          if (router.hasRoute(name)) {
            try {
              router.removeRoute(name);
            } catch (_) {}
          }
        }
      }
      this.registeredRouteNames = [];

      // 2. 重新向后端发起菜单树请求并生成路由
      const accessedRoutes = await this.generateRoutes();

      // 3. 统一挂载动态路由、RootRedirect 与 404 兜底路由
      if (router) {
        this.mountRoutesToRouter(router, accessedRoutes);

        // 4. 检查当前用户停留在的页面是否仍然具有权限
        const currentPath = router.currentRoute?.value?.path;
        const whiteList = ['/login', '/404', '/profile', '/dashboard', '/'];
        if (currentPath && !whiteList.includes(currentPath)) {
          const hasAccess = this.checkPathAccess(this.sidebarMenus, currentPath);
          if (!hasAccess) {
            ElNotification.warning({
              title: '岗位权限已变更',
              message: '您当前浏览的业务模块访问权限已被调整，系统已自动为您返回工作台。',
              duration: 5000,
            });
            router.replace('/dashboard');
          }
        }
      }

      return accessedRoutes;
    },

    /**
     * 用户登出时重置路由加载状态与缓存
     */
    resetRoutes() {
      this.routes = [];
      this.sidebarMenus = [];
      this.registeredRouteNames = [];
      this.isRoutesLoaded = false;
    },
  },
});
