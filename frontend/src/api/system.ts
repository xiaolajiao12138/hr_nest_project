import request from '@/utils/request';

// 用户管理
export function getUserListApi(params: any) {
  return request({ url: '/system/user/list', method: 'get', params });
}
export function createUserApi(data: any) {
  return request({ url: '/system/user', method: 'post', data });
}
export function updateUserApi(id: number, data: any) {
  return request({ url: `/system/user/${id}`, method: 'put', data });
}
export function deleteUserApi(id: number) {
  return request({ url: `/system/user/${id}`, method: 'delete' });
}
export function resetPasswordApi(id: number, data: any) {
  return request({ url: `/system/user/${id}/reset-password`, method: 'patch', data });
}
export function changeUserStatusApi(id: number, status: number) {
  return request({ url: `/system/user/${id}/status`, method: 'patch', data: { status } });
}

// 角色管理
export function getRoleListApi(params: any) {
  return request({ url: '/system/role/list', method: 'get', params });
}
export function getAllRolesApi() {
  return request({ url: '/system/role/all', method: 'get' });
}
export function getRoleMenusApi(roleId: number) {
  return request({ url: `/system/role/${roleId}/menus`, method: 'get' });
}
export function createRoleApi(data: any) {
  return request({ url: '/system/role', method: 'post', data });
}
export function updateRoleApi(id: number, data: any) {
  return request({ url: `/system/role/${id}`, method: 'put', data });
}
export function updateRoleMenusApi(id: number, menuIds: number[]) {
  return request({ url: `/system/role/${id}/menus`, method: 'put', data: { menuIds } });
}
export function deleteRoleApi(id: number) {
  return request({ url: `/system/role/${id}`, method: 'delete' });
}

// 菜单管理
export function getMenuTreeApi() {
  return request({ url: '/system/menu/tree', method: 'get' });
}
export function createMenuApi(data: any) {
  return request({ url: '/system/menu', method: 'post', data });
}
export function updateMenuApi(id: number, data: any) {
  return request({ url: `/system/menu/${id}`, method: 'put', data });
}
export function deleteMenuApi(id: number) {
  return request({ url: `/system/menu/${id}`, method: 'delete' });
}
