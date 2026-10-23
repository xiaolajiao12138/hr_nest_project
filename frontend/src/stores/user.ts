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

    // 局部更新用户信息（例如在个人中心修改姓名、头像、手机号等）
    updateUserProfile(partialInfo: Record<string, any>) {
      if (this.userInfo) {
        this.userInfo = { ...this.userInfo, ...partialInfo };
        setUserInfo(this.userInfo);
      }
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
