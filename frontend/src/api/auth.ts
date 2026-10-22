import request from '@/utils/request';

// 获取图形验证码
export function getCaptchaApi() {
  return request({
    url: '/auth/captcha',
    method: 'get',
  });
}

// 登录
export function loginApi(data: any) {
  return request({
    url: '/auth/login',
    method: 'post',
    data,
  });
}

// 获取用户信息及权限
export function getUserInfoApi() {
  return request({
    url: '/auth/user-info',
    method: 'get',
  });
}

// 核心：获取当前用户角色专属的动态菜单路由清单【前端不写死路由】
export function getDynamicRoutesApi() {
  return request({
    url: '/auth/routes',
    method: 'get',
  });
}
