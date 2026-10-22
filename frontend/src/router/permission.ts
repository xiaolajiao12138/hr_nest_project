import router from './index';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';
import { getToken } from '@/utils/auth';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: false });

const whiteList = ['/login'];

router.beforeEach(async (to, from, next) => {
  NProgress.start();

  const hasToken = getToken();

  if (hasToken) {
    if (to.path === '/login') {
      next({ path: '/' });
      NProgress.done();
    } else {
      const userStore = useUserStore();
      const permissionStore = usePermissionStore();

      // 判断用户信息是否已拉取
      if (!userStore.roles || userStore.roles.length === 0) {
        try {
          await userStore.getInfo();
        } catch (error) {
          userStore.logout();
          next(`/login?redirect=${to.path}`);
          NProgress.done();
          return;
        }
      }

      // 核心：若动态路由尚未从数据库接口加载，则动态拉取并 addRoute
      if (!permissionStore.isRoutesLoaded) {
        try {
          const accessRoutes = await permissionStore.generateRoutes();

          // 循环动态挂载路由
          accessRoutes.forEach((route) => {
            router.addRoute(route);
          });

          // 动态注册根路径重定向
          router.addRoute({
            path: '/',
            redirect: '/dashboard',
          });

          // 动态捕获所有未定义路径至 404
          router.addRoute({
            path: '/:pathMatch(.*)*',
            redirect: '/404',
          });

          // 确保 addRoute 注册完成，replace 进入目标路由
          next({ ...to, replace: true });
        } catch (err) {
          console.error('[动态路由挂载失败]', err);
          userStore.logout();
          next(`/login?redirect=${to.path}`);
          NProgress.done();
        }
      } else {
        next();
      }
    }
  } else {
    // 免密白名单
    if (whiteList.includes(to.path)) {
      next();
    } else {
      next(`/login?redirect=${to.path}`);
      NProgress.done();
    }
  }
});

router.afterEach((to) => {
  NProgress.done();
  if (to.meta?.title) {
    document.title = `${to.meta.title} - 企业级HR人事管理系统`;
  }
});
