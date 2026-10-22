import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

// 基础公开路由清单（仅保留登录与404，业务路由登录后完全由后端数据库驱动动态生成）
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/404.vue'),
    meta: { title: '404', hidden: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

export default router;
