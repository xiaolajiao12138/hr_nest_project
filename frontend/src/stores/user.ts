import { defineStore } from 'pinia';
import { loginApi, getUserInfoApi } from '@/api/auth';
import {
  getToken,
  setToken,
  setRefreshToken,
  removeToken,
  setUserInfo,
  getUserInfo,
} from '@/utils/auth';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken() || '',
    userInfo: getUserInfo() || null,
    roles: [] as string[],
    permissions: [] as string[],
  }),

  actions: {
    // 登录
    async login(loginForm: any) {
      const res: any = await loginApi(loginForm);
      this.token = res.accessToken;
      setToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      this.userInfo = res.user;
      setUserInfo(res.user);
      this.roles = res.user.roles || [];
      return res;
    },

    // 获取当前登录人信息和权限
    async getInfo() {
      const res: any = await getUserInfoApi();
      this.userInfo = res.user;
      setUserInfo(res.user);
      this.roles = res.roles || [];
      this.permissions = res.permissions || [];
      return res;
    },

    // 登出
    logout() {
      this.token = '';
      this.userInfo = null;
      this.roles = [];
      this.permissions = [];
      removeToken();
    },
  },
});
