import request from '@/utils/request';

export function getLeaveListApi(params: any) {
  return request({
    url: '/hr/leave/list',
    method: 'get',
    params,
  });
}

export function getLeavePendingCountApi(): Promise<{ count: number }> {
  return request({
    url: '/hr/leave/pending-count',
    method: 'get',
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

export function auditLeaveApi(data: { id: number; action: 'APPROVED' | 'REJECTED'; auditRemark?: string }) {
  return request({
    url: '/hr/leave/audit',
    method: 'put',
    data,
  });
}
