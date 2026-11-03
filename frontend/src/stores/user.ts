import { resolveAvatar, clearAvatarCache } from '@/utils/avatar';
import { defineStore } from 'pinia';
import { loginApi, getUserInfoApi } from '@/api/auth';
import { encryptRsa } from '@/utils/rsa';
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
    dataScopes: {} as Record<string,{all:boolean;deptIds:number[];self:boolean}>,
  }),

  actions: {
    // 登录
    async login(loginForm: any) {
      // 密码采用 RSA 公钥非对称加密传输，防止网络抓包密码泄露
      const encryptedPassword = await encryptRsa(loginForm.password);
      const payload = {
        ...loginForm,
        password: encryptedPassword,
      };

      const res: any = await loginApi(payload);
      this.token = res.accessToken;
      setToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      const normalizedUser = { ...res.user, avatar: resolveAvatar(res.user?.avatar) };
      this.userInfo = normalizedUser;
      setUserInfo(normalizedUser);
      this.roles = res.user.roles || [];
      return res;
    },

    // 获取当前登录人信息和权限
    async getInfo() {
      const res: any = await getUserInfoApi();
      const normalizedUser = { ...res.user, avatar: resolveAvatar(res.user?.avatar) };
      this.userInfo = normalizedUser;
      setUserInfo(normalizedUser);
      this.roles = res.roles || [];
      this.permissions = res.permissions || [];
      this.dataScopes = res.dataScopes || {};
      return res;
    },

    // 局部更新用户信息（例如在个人中心修改姓名、头像、手机号等）
    updateUserProfile(partialInfo: Record<string, any>) {
      if (this.userInfo) {
        const nextInfo = { ...this.userInfo, ...partialInfo };
        if (partialInfo.avatar !== undefined) {
          nextInfo.avatar = resolveAvatar(partialInfo.avatar);
        }
        this.userInfo = nextInfo;
        setUserInfo(nextInfo);
      }
    },

    // 登出
    logout() {
      clearAvatarCache();
      this.token = '';
      this.userInfo = null;
      this.roles = [];
      this.permissions = [];
      this.dataScopes = {};
      removeToken();
    },
  },
});
