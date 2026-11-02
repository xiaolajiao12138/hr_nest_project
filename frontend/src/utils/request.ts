import axios, { AxiosRequestConfig } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getToken,
  setToken,
  getRefreshToken,
  removeToken,
} from './auth';
import router from '@/router';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';

/**
 * 标记当前是否正在向后端申请刷新 Token
 * 用于控制并发请求时的锁机制，避免多个 401 并发时重复请求 refresh-token 接口
 */
let isRefreshing = false;

/**
 * 标记当前用户是否处于主动登出过程中
 * 防止用户主动退出登录后，残留未完成的请求触发失效弹窗造成跳脸打扰
 */
let isLoggingOut = false;

/**
 * 标记重新登录确认弹窗是否已在展示中（防止多接口并发 401 导致连续弹窗）
 */
let isReloginBoxOpen = false;

/**
 * 设置主动登出状态标记
 */
export function setIsLoggingOut(val: boolean) {
  isLoggingOut = val;
}

/**
 * 挂起的请求重试队列
 * 当 Token 正在刷新时，后续收到的 401 请求被包装为回调推入此队列，刷新成功后统一注入新 Token 并重试
 */
let requestsQueue: Array<(token: string) => void> = [];

/**
 * Axios 统一网络请求实例
 */
const service = axios.create({
  baseURL: import.meta.env.VITE_API_PREFIX || '/api',
  timeout: 30000,
});

/**
 * 全局请求拦截器
 * 自动在 Header 中注入 JWT Bearer Token
 */
service.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * 全局响应拦截器
 * 统一拦截解包响应数据、处理二进制流下载、捕获 401 并无感刷新 Token、统一弹出业务错误提示
 */
service.interceptors.response.use(
  async (response) => {
    // 1. 处理二进制文件流（如 Excel 导出、图片预览等），直接返回原生 Buffer/Blob 数据
    if (
      response.config.responseType === 'blob' ||
      response.config.responseType === 'arraybuffer'
    ) {
      return response.data;
    }

    const res = response.data;

    // 2. 业务状态码 200：直接解包返回业务数据实体 data
    if (res.code === 200) {
      return res.data;
    }

    // 3. 业务状态码 401：凭证失效，采用双 Token 机制在后台无感刷新
    if (res.code === 401) {
      const config = response.config;
      const refreshToken = getRefreshToken();

      // 若本地未存有长效 RefreshToken，直接重定向至登录页
      if (!refreshToken) {
        handleRelogin();
        return Promise.reject(new Error(res.msg || '登录已过期'));
      }

      // 若当前未处于刷新状态，加锁并向服务端申请新 AccessToken
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await axios.post(
            `${import.meta.env.VITE_API_PREFIX || '/api'}/auth/refresh-token`,
            { refreshToken },
          );

          if (refreshRes.data && refreshRes.data.code === 200) {
            const newToken = refreshRes.data.data.accessToken;
            // 更新本地存储的最新凭据
            setToken(newToken);
            config.headers.Authorization = `Bearer ${newToken}`;

            // 批量消费队列中挂起的重试任务
            requestsQueue.forEach((cb) => cb(newToken));
            requestsQueue = [];

            // 重新发送当前失败的请求
            return service(config);
          } else {
            handleRelogin();
            return Promise.reject(new Error('刷新凭证失败'));
          }
        } catch (e) {
          handleRelogin();
          return Promise.reject(e);
        } finally {
          isRefreshing = false;
        }
      } else {
        // 若当前已有正在执行的刷新请求，将当前请求包装为 Promise 挂起至重试队列
        return new Promise((resolve) => {
          requestsQueue.push((newToken: string) => {
            config.headers.Authorization = `Bearer ${newToken}`;
            resolve(service(config));
          });
        });
      }
    }

    // 4. 其他业务异常统一弹出错误气泡提示
    ElMessage.error(res.msg || '系统繁忙，请稍后重试');
    return Promise.reject(new Error(res.msg || 'Error'));
  },
  (error) => {
    let msg = error.message || '网络连接异常';
    if (error.response) {
      if (error.response.status === 401) {
        handleRelogin();
        return Promise.reject(error);
      }
      if (error.response.status === 403) {
        // 权限不足/被调整兜底：静默触发全量权限与路由热重载自愈
        try {
          const userStore = useUserStore();
          const permissionStore = usePermissionStore();
          userStore.getInfo().catch(() => {});
          permissionStore.reloadRoutes(router).catch(() => {});
        } catch (_) {}
      }
      msg = error.response.data?.msg || `服务响应异常 (${error.response.status})`;
    }
    ElMessage.error(msg);
    return Promise.reject(error);
  },
);

/**
 * 登录态完全失效时的兜底处理
 * 1. 严格检查：若用户正主动登出或当前已经在登录页，坚决不弹出任何失效提示框；
 * 2. 避免并发 401 多次弹窗；
 * 3. 真正失效时友好提示并安全引导重定向至登录页。
 */
export function handleRelogin() {
  removeToken();

  // 1. 如果当前页面已经是登录页，或者正处于主动登出过程中，直接安全静默放行，绝不弹窗打扰用户
  const currentPath = router.currentRoute?.value?.path || window.location.pathname;
  if (isLoggingOut || currentPath === '/login' || currentPath.startsWith('/login')) {
    return;
  }

  // 2. 防抖防重入：已在展示弹窗时直接跳过，杜绝重复弹窗
  if (isReloginBoxOpen) {
    return;
  }
  isReloginBoxOpen = true;

  ElMessageBox.confirm('登录状态已失效，请重新登录系统', '提示', {
    confirmButtonText: '重新登录',
    cancelButtonText: '取消',
    type: 'warning',
    distinguishCancelAndClose: true,
  })
    .then(() => {
      router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
    })
    .catch(() => {
      router.push('/login');
    })
    .finally(() => {
      isReloginBoxOpen = false;
    });
}

export default service;
