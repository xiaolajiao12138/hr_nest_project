import { defineStore } from 'pinia';
import { RouteRecordRaw } from 'vue-router';
import { getDynamicRoutesApi } from '@/api/auth';
import Layout from '@/layout/index.vue';

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
  }),

  actions: {
    /**
     * 向后端请求当前用户所属角色的菜单树，并转换为可直接被 Vue-Router 消费的 RouteRecordRaw 集合
     *
     * @returns 返回解析完成的动态路由记录数组
     */
    async generateRoutes(): Promise<RouteRecordRaw[]> {
      const serverRoutes: any = (await getDynamicRoutesApi()) || [];

      // 菜单自愈保底：若人事管理目录存在但尚未包含薪酬核算，自动增补薪酬核算菜单项
      const hrMenu = serverRoutes.find(
        (m: any) =>
          m.path === '/hr' ||
          m.name === 'HumanResources' ||
          m.meta?.title === '人事管理',
      );
      if (hrMenu) {
        if (!hrMenu.children) hrMenu.children = [];
        const hasSalary = hrMenu.children.some(
          (c: any) => c.path === '/hr/salary' || c.name === 'SalaryManage',
        );
        if (!hasSalary) {
          hrMenu.children.push({
            id: 204,
            parentId: hrMenu.id || 2,
            path: '/hr/salary',
            name: 'SalaryManage',
            component: 'views/hr/salary/index.vue',
            meta: {
              title: '薪酬核算',
              icon: 'Money',
              hidden: false,
              isFrame: false,
            },
          });
        }
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
        // 自动在外层包装顶级 Layout 容器，使工作台始终能展示左侧导航栏与顶部工具栏
        if (isRoot && item.component !== 'Layout') {
          res.push({
            path: item.path,
            component: Layout,
            children: [
              {
                path: '',
                name: item.name || `Route_${item.id}`,
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
     * 用户登出时重置路由加载状态与缓存
     */
    resetRoutes() {
      this.routes = [];
      this.sidebarMenus = [];
      this.isRoutesLoaded = false;
    },
  },
});
