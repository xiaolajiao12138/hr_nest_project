import request from '@/utils/request';

/**
 * 绩效考评方案接口定义
 */
export interface PerformancePlanItem {
  id: number;
  title: string;
  cycleType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: string;
  endDate: string;
  weightSelf: number;
  weightManager: number;
  metrics?: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';
  remark?: string;
  totalEmployees?: number;
  completedCount?: number;
  completionRate?: number;
}

/**
 * 考评记录明细接口定义
 */
export interface PerformanceRecordItem {
  id: number;
  planId: number;
  empId: number;
  empName: string;
  empNo: string;
  deptId?: number;
  deptName?: string;
  post?: string;
  selfScore?: number | null;
  selfComment?: string;
  managerScore?: number | null;
  managerComment?: string;
  finalScore?: number | null;
  rating?: string | null;
  coefficient?: number;
  status: 'PENDING_SELF' | 'PENDING_MANAGER' | 'COMPLETED';
  evaluatedAt?: string | null;
  createdAt?: string;
}

/**
 * 获取所有绩效考评方案
 */
export function getPlanListApi() {
  return request<PerformancePlanItem[]>({
    url: '/hr/performance/plan/list',
    method: 'get',
  });
}

/**
 * 创建考评方案
 */
export function createPlanApi(data: any) {
  return request({
    url: '/hr/performance/plan',
    method: 'post',
    data,
  });
}

/**
 * 更新考评方案
 */
export function updatePlanApi(id: number, data: any) {
  return request({
    url: `/hr/performance/plan/${id}`,
    method: 'put',
    data,
  });
}

/**
 * 删除考评方案
 */
export function deletePlanApi(id: number) {
  return request({
    url: `/hr/performance/plan/${id}`,
    method: 'delete',
  });
}

/**
 * 分页获取考评记录明细
 */
export function getPerformanceRecordListApi(params: any) {
  return request<{ list: PerformanceRecordItem[]; total: number }>({
    url: '/hr/performance/record/list',
    method: 'get',
    params,
  });
}

/**
 * 获取绩效综合统计与等级正态分布看板
 */
export function getPerformanceAnalyticsApi(planId?: number) {
  return request<{
    planId: number;
    totalCount: number;
    completedCount: number;
    completionRate: number;
    avgScore: number;
    excellentRate: number;
    distribution: { S: number; A: number; B: number; C: number; D: number };
  }>({
    url: '/hr/performance/analytics',
    method: 'get',
    params: { planId },
  });
}

/**
 * 批量发起考评单
 */
export function launchPerformanceAppraisalApi(data: {
  planId: number;
  deptIds?: number[];
  empIds?: number[];
}) {
  return request<{ createdCount: number }>({
    url: '/hr/performance/launch',
    method: 'post',
    data,
  });
}

/**
 * 员工自评或主管打分定级
 */
export function evaluatePerformanceApi(data: {
  recordId: number;
  evalType: 'self' | 'manager' | 'both';
  selfScore?: number;
  selfComment?: string;
  managerScore?: number;
  managerComment?: string;
  customFinalScore?: number;
  customRating?: string;
}) {
  return request<PerformanceRecordItem>({
    url: '/hr/performance/evaluate',
    method: 'post',
    data,
  });
}

/**
 * 考评方案归档
 */
export function archivePerformancePlanApi(planId: number) {
  return request({
    url: `/hr/performance/archive/${planId}`,
    method: 'post',
  });
}

/**
 * 绩效系数联动同步至指定月份薪资核算
 */
export function syncPerformanceToSalaryApi(data: { planId: number; yearMonth: string }) {
  return request<{ updatedCount: number }>({
    url: '/hr/performance/sync-salary',
    method: 'post',
    data,
  });
}

/**
 * 导出考评报表
 */
export function exportPerformanceReportApi(planId: number) {
  return request({
    url: `/hr/performance/export/${planId}`,
    method: 'get',
    responseType: 'blob',
  });
}
