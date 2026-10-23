import request from '@/utils/request';

export function getLeaveListApi(params: any) {
  return request({
    url: '/hr/leave/list',
    method: 'get',
    params,
  });
}

/**
 * 根据 ID 查询请假单详情
 * Query 参数规范: GET /hr/leave/detail?id=4
 */
export function getLeaveDetailApi(id: number) {
  return request({
    url: '/hr/leave/detail',
    method: 'get',
    params: { id },
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

/**
 * 分页查询全员年假额度台账列表
 */
export function getAnnualLeaveListApi(params: any) {
  return request<{ list: any[]; total: number }>({
    url: '/hr/leave/annual/list',
    method: 'get',
    params,
  });
}

/**
 * HR 管理员微调员工年假额度
 */
export function adjustAnnualLeaveApi(data: { id: number; totalDays: number; remark?: string }) {
  return request({
    url: '/hr/leave/annual/adjust',
    method: 'put',
    data,
  });
}

/**
 * 批量为指定年度全员初始化年假账户
 */
export function initAnnualLeaveForYearApi(data: { year: number; defaultDays?: number }) {
  return request<{ createdCount: number }>({
    url: '/hr/leave/annual/init-year',
    method: 'post',
    data,
  });
}
