import axios, { AxiosRequestConfig } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getToken, setToken, getRefreshToken, removeToken } from './auth';
import router from '@/router';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';

let refreshPromise: Promise<string> | null = null;
let isLoggingOut = false;
let isReloginBoxOpen = false;
export function setIsLoggingOut(value: boolean) { isLoggingOut = value; }
const service = axios.create({baseURL:import.meta.env.VITE_API_PREFIX || '/api',timeout:30000});
service.interceptors.request.use(config => { const token=getToken(); if(token) config.headers.Authorization='Bearer '+token; return config; });

async function decodePayload(data: any, contentType: string) {
  if (/json/i.test(contentType)) {
    if (data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
  }
  return data;
}

async function processResponse(response: any) {
  const payload = await decodePayload(response.data, String(response.headers?.['content-type'] || ''));
  const code = payload?.code ?? response.status;
  const config = response.config as AxiosRequestConfig & {_retried?:boolean};
  if (code === 401) {
    const refreshToken = getRefreshToken();
    if (!refreshToken || config._retried || isLoggingOut) { handleRelogin(); throw new Error(payload?.msg || '登录已过期'); }
    config._retried = true;
    if (!refreshPromise) {
      refreshPromise = axios.post((import.meta.env.VITE_API_PREFIX || '/api')+'/auth/refresh-token',{refreshToken},{timeout:15000})
        .then(res => { const token=res.data?.data?.accessToken; if(res.data?.code!==200 || !token) throw new Error('刷新凭证失败'); setToken(token); return token as string; })
        .catch(error => {handleRelogin(); throw error;}).finally(() => {refreshPromise=null;});
    }
    const token = await refreshPromise;
    config.headers = {...config.headers,Authorization:'Bearer '+token};
    return service(config);
  }
  if (code === 200 || (code >= 200 && code < 300)) {
    if (payload?.code === 200) return payload.data;
    return payload;
  }
  const error = Object.assign(new Error(payload?.msg || payload?.message || '请求失败 ('+code+')'),{notified:true});
  ElMessage.error(error.message);
  throw error;
}
service.interceptors.response.use(processResponse, async error => {
  if (error.response) return processResponse(error.response);
  if (!axios.isCancel(error)) {error.notified=true;ElMessage.error(error.message || '网络连接异常');}
  throw error;
});

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
