import { defineStore } from 'pinia';
import { RouteRecordRaw } from 'vue-router';
import { getDynamicRoutesApi } from '@/api/auth';
import Layout from '@/layout/index.vue';

// Vite 动态加载 views 目录下的所有 vue 组件
const modules = import.meta.glob('../views/**/*.vue');

export const usePermissionStore = defineStore('permission', {
  state: () => ({
    // 动态添加的所有路由
    routes: [] as RouteRecordRaw[],
    // 用于侧边栏渲染的菜单树
    sidebarMenus: [] as any[],
    // 是否已动态加载过路由
    isRoutesLoaded: false,
  }),

  actions: {
    /**
     * 从后端数据库获取当前角色拥有的菜单树，并动态转换为 Vue Router 格式
     */
    async generateRoutes(): Promise<RouteRecordRaw[]> {
      const serverRoutes: any = await getDynamicRoutesApi();
      this.sidebarMenus = serverRoutes;

      // 递归转换后端菜单为 RouteRecordRaw
      const accessedRoutes = this.transformRoutes(serverRoutes);

      this.routes = accessedRoutes;
      this.isRoutesLoaded = true;
      return accessedRoutes;
    },

    /**
     * 递归转换路由结构
     */
    transformRoutes(asyncRoutes: any[]): RouteRecordRaw[] {
      const res: RouteRecordRaw[] = [];

      for (const item of asyncRoutes) {
        // 构建路由元信息
        const routeRecord: any = {
          path: item.path,
          name: item.name,
          meta: {
            title: item.meta?.title || '',
            icon: item.meta?.icon || '',
            hidden: Boolean(item.meta?.hidden),
            isFrame: Boolean(item.meta?.isFrame),
          },
        };

        // 处理组件 Component
        if (item.component === 'Layout') {
          routeRecord.component = Layout;
        } else if (item.component) {
          // 规范路径格式，匹配 modules
          let compPath = item.component.replace(/^\//, '');
          if (!compPath.startsWith('views/')) {
            compPath = `views/${compPath}`;
          }
          const moduleKey = `../${compPath}`;

          if (modules[moduleKey]) {
            routeRecord.component = modules[moduleKey];
          } else {
            console.warn(`[动态路由] 未找到组件路径: ${moduleKey}`);
            // 找不到时降级为空视图，避免页面崩溃
            routeRecord.component = () => import('@/views/404.vue');
          }
        }

        // 处理子路由
        if (item.children && item.children.length > 0) {
          routeRecord.children = this.transformRoutes(item.children);
        }

        res.push(routeRecord as RouteRecordRaw);
      }

      return res;
    },

    // 重置路由状态
    resetRoutes() {
      this.routes = [];
      this.sidebarMenus = [];
      this.isRoutesLoaded = false;
    },
  },
});
