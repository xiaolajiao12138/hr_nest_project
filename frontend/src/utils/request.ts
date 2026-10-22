import axios, { AxiosRequestConfig } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getToken,
  setToken,
  getRefreshToken,
  removeToken,
} from './auth';

let isRefreshing = false;
let requestsQueue: Array<(token: string) => void> = [];

const service = axios.create({
  baseURL: import.meta.env.VITE_API_PREFIX || '/api',
  timeout: 30000,
});

// 请求拦截器
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

// 响应拦截器
service.interceptors.response.use(
  async (response) => {
    // 处理二进制流（如 Excel 导出）
    if (
      response.config.responseType === 'blob' ||
      response.config.responseType === 'arraybuffer'
    ) {
      return response.data;
    }

    const res = response.data;

    // 业务正常
    if (res.code === 200) {
      return res.data;
    }

    // 401 凭证失效 - 尝试通过 RefreshToken 无感刷新
    if (res.code === 401) {
      const config = response.config;
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        handleRelogin();
        return Promise.reject(new Error(res.msg || '登录已过期'));
      }

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await axios.post(
            `${import.meta.env.VITE_API_PREFIX || '/api'}/auth/refresh-token`,
            { refreshToken },
          );

          if (refreshRes.data && refreshRes.data.code === 200) {
            const newToken = refreshRes.data.data.accessToken;
            setToken(newToken);
            config.headers.Authorization = `Bearer ${newToken}`;

            // 重发队列中的所有请求
            requestsQueue.forEach((cb) => cb(newToken));
            requestsQueue = [];

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
        // 正在刷新中，将当前请求加入重试队列
        return new Promise((resolve) => {
          requestsQueue.push((newToken: string) => {
            config.headers.Authorization = `Bearer ${newToken}`;
            resolve(service(config));
          });
        });
      }
    }

    // 其他业务异常
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
      msg = error.response.data?.msg || `服务响应异常 (${error.response.status})`;
    }
    ElMessage.error(msg);
    return Promise.reject(error);
  },
);

function handleRelogin() {
  removeToken();
  ElMessageBox.confirm('登录状态已失效，请重新登录系统', '提示', {
    confirmButtonText: '重新登录',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    window.location.href = '/login';
  });
}

export default service;
