import request from '@/utils/request';

export function getLeaveListApi(params: any) {
  return request({
    url: '/hr/leave/list',
    method: 'get',
    params,
  });
}

export function getAnnualBalanceApi(empId: number, year?: number) {
  return request({
    url: `/hr/leave/annual-balance/${empId}`,
    method: 'get',
    params: { year },
  });
}

export function applyLeaveApi(data: any) {
  return request({
    url: '/hr/leave/apply',
    method: 'post',
    data,
  });
}

export function auditLeaveApi(id: number, data: { action: 'APPROVED' | 'REJECTED'; auditRemark?: string }) {
  return request({
    url: `/hr/leave/${id}/audit`,
    method: 'patch',
    data,
  });
}
