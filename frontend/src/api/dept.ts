import request from '@/utils/request';

export function getDeptTreeApi() {
  return request({
    url: '/hr/dept/tree',
    method: 'get',
  });
}

export function getDeptDetailApi(id: number) {
  return request({
    url: '/hr/dept/detail',
    method: 'get',
    params: { id },
  });
}

export function createDeptApi(data: any) {
  return request({
    url: '/hr/dept',
    method: 'post',
    data,
  });
}

export function updateDeptApi(id: number, data: any) {
  return request({
    url: `/hr/dept/${id}`,
    method: 'put',
    data,
  });
}

export function deleteDeptApi(id: number) {
  return request({
    url: `/hr/dept/${id}`,
    method: 'delete',
  });
}

export function updateDeptSortApi(data: { id: number; parentId?: number; sort: number }) {
  return request({
    url: '/hr/dept/sort',
    method: 'put',
    data,
  });
}
