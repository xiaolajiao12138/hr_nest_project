import request from '@/utils/request';

export interface SalaryRecord {
  id: number;
  employeeId: number;
  yearMonth: string;
  baseSalary: number;
  postSalary: number;
  performanceSalary: number;
  overtimeSalary: number;
  allowance: number;
  grossSalary: number;
  leaveDeduction: number;
  socialSecurity: number;
  housingFund: number;
  tax: number;
  totalDeduction: number;
  netSalary: number;
  status: number; // 1: 草稿, 2: 已核准, 3: 已发
  hasPassword?: boolean;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: number;
    name: string;
    employeeNo: string;
    department?: {
      id: number;
      name: string;
    };
    position?: {
      id: number;
      name: string;
    };
  };
}

export interface SalaryKPI {
  totalGross: number;
  totalNet: number;
  totalDeduction: number;
  totalCount: number;
  draftCount: number;
  confirmedCount: number;
  paidCount: number;
}

export interface QuerySalaryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  yearMonth?: string;
  departmentId?: number;
  status?: number;
}

export interface SalaryListResult {
  list: SalaryRecord[];
  total: number;
  kpi: SalaryKPI;
}

/**
 * 分页获取月度薪酬列表及汇总 KPI
 */
export function getSalaryListApi(params: QuerySalaryParams) {
  return request<SalaryListResult>({
    url: '/salary/list',
    method: 'get',
    params,
  });
}

/**
 * 一键智能核算当月全员薪资草稿
 */
export function calculateSalaryApi(data: { yearMonth: string; overwrite?: boolean }) {
  return request<{ count: number; yearMonth: string }>({
    url: '/salary/calculate',
    method: 'post',
    data,
  });
}

/**
 * 手工调整单条薪资明细
 */
export function updateSalaryApi(id: number, data: Partial<SalaryRecord> & { payslipPassword?: string }) {
  return request<SalaryRecord>({
    url: `/salary/${id}`,
    method: 'put',
    data,
  });
}

/**
 * 批量审批确认或发放薪酬
 */
export function batchConfirmSalaryApi(data: { ids: number[]; status: number }) {
  return request<{ affected: number }>({
    url: '/salary/batch-confirm',
    method: 'post',
    data,
  });
}

/**
 * 导出月度薪资明细 Excel 报表
 */
export function exportSalaryApi(yearMonth: string) {
  return request({
    url: '/salary/export',
    method: 'get',
    params: { yearMonth },
    responseType: 'blob',
  });
}

/**
 * 员工端: 查询个人所有月份工资条简要列表
 */
export function getMyPayslipsApi() {
  return request<Array<{
    id: number;
    yearMonth: string;
    status: number;
    hasPassword: boolean;
    netSalary: number;
    createdAt: string;
  }>>({
    url: '/salary/my-payslips',
    method: 'get',
  });
}

/**
 * 员工端: 安全验证并解密指定月份工资条详情
 */
export function verifyPayslipApi(data: { salaryId: number; password?: string }) {
  return request<SalaryRecord>({
    url: '/salary/my-payslips/verify',
    method: 'post',
    data,
  });
}
