import request from '@/utils/request';

export function getDeptTreeApi() {
  return request({
    url: '/hr/dept/tree',
    method: 'get',
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

export function updateDeptSortApi(id: number, parentId: number, sort: number) {
  return request({
    url: `/hr/dept/${id}/sort`,
    method: 'patch',
    data: { parentId, sort },
  });
}
