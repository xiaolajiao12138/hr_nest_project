import request from '@/utils/request';

export interface DashboardStats {
  overview: {
    totalEmployees: number;
    pendingLeaves: number;
    deptCount: number;
    attendanceRate: number;
  };
  deptDistribution: {
    deptName: string;
    actualCount: number;
    planCount: number;
  }[];
  educationDistribution: {
    name: string;
    value: number;
  }[];
  leaveTrend: {
    months: string[];
    annual: number[];
    sick: number[];
    casual: number[];
  };
}

/**
 * 获取首页工作台统计概览与图表数据
 */
export function getDashboardStatsApi(): Promise<DashboardStats> {
  return request({
    url: '/dashboard/stats',
    method: 'get',
  });
}
