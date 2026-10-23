import request from '@/utils/request';

export interface UserProfile {
  id: number;
  username: string;
  realName: string;
  phone: string;
  email: string;
  avatar: string;
  status: number;
  createdAt: string;
  dept?: {
    id: number;
    deptName: string;
  } | null;
  roles?: Array<{
    id: number;
    roleName: string;
    roleKey: string;
  }>;
}

export interface UpdateProfileParams {
  realName?: string;
  phone?: string;
  email?: string;
  avatar?: string;
}

export interface UpdatePasswordParams {
  oldPassword: string;
  newPassword: string;
}

/**
 * 获取当前登录用户的个人中心详细信息
 */
export function getUserProfileApi() {
  return request<UserProfile>({
    url: '/system/user/profile',
    method: 'get',
  });
}

/**
 * 更新当前用户个人资料
 */
export function updateUserProfileApi(data: UpdateProfileParams) {
  return request({
    url: '/system/user/profile',
    method: 'put',
    data,
  });
}

/**
 * 修改当前用户登录密码
 */
export function updateUserPasswordApi(data: UpdatePasswordParams) {
  return request({
    url: '/system/user/profile/update-pwd',
    method: 'put',
    data,
  });
}

/**
 * 分页获取当前用户个人的操作日志
 */
export function getUserProfileLogsApi(params: { page: number; pageSize: number }) {
  return request({
    url: '/system/user/profile/logs',
    method: 'get',
    params,
  });
}

/**
 * 上传个人头像
 */
export function uploadAvatarApi(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'avatar');

  return request({
    url: '/upload/file',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}
