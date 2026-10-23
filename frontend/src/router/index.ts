import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Layout from '@/layout/index.vue';

// 基础公开路由清单（仅保留登录、404及基础框架页面如个人中心）
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
  {
    path: '/profile',
    component: Layout,
    meta: { hidden: true },
    children: [
      {
        path: '',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '个人中心', icon: 'User' },
      },
    ],
  },
  {
    path: '/hr/salary',
    component: Layout,
    children: [
      {
        path: '',
        name: 'SalaryManage',
        component: () => import('@/views/hr/salary/index.vue'),
        meta: { title: '薪酬核算管理', icon: 'Money' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

export default router;
