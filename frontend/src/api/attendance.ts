import request from '@/utils/request';

export interface AttendanceShift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  lateTolerance: number;
  earlyTolerance: number;
  workHours: number;
  isDefault: boolean;
  status: number;
  remark?: string;
  createdAt?: string;
}

export interface AttendanceRecordItem {
  id: number;
  empId: number;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  shiftId?: number;
  checkInStatus: number; // 1:正常 2:迟到 3:缺卡
  checkOutStatus: number; // 1:正常 2:早退 3:缺卡
  status: number; // 1:正常出勤 2:迟到 3:早退 4:旷工 5:请假 6:休息
  workHours: number;
  checkInIp?: string;
  checkOutIp?: string;
  remark?: string;
  employee?: {
    id: number;
    name: string;
    empNo: string;
    post?: string;
    dept?: {
      id: number;
      deptName: string;
    };
  };
  shift?: AttendanceShift;
}

export interface AttendanceKPI {
  totalCount: number;
  normalCount: number;
  lateCount: number;
  earlyCount: number;
  absentCount: number;
  totalWorkHours: number;
  attendanceRate: number;
}

export interface QueryAttendanceParams {
  page?: number;
  pageSize?: number;
  yearMonth?: string;
  date?: string;
  deptId?: number;
  empId?: number;
  status?: number;
  keyword?: string;
}

/** 获取全部班次列表 */
export function getShiftListApi() {
  return request<AttendanceShift[]>({
    url: '/attendance/shift/list',
    method: 'get',
  });
}

/**
 * 根据 ID 查询班次规则详情
 * Query 参数规范: GET /attendance/shift/detail?id=4
 */
export function getShiftDetailApi(id: number) {
  return request<AttendanceShift>({
    url: '/attendance/shift/detail',
    method: 'get',
    params: { id },
  });
}

/** 新增或保存班次 */
export function createShiftApi(data: Partial<AttendanceShift>) {
  return request({
    url: '/attendance/shift',
    method: 'post',
    data,
  });
}

/** 修改班次 */
export function updateShiftApi(id: number, data: Partial<AttendanceShift>) {
  return request({
    url: `/attendance/shift/${id}`,
    method: 'put',
    data,
  });
}

/** 删除班次 */
export function deleteShiftApi(id: number) {
  return request({
    url: `/attendance/shift/${id}`,
    method: 'delete',
  });
}

/** 查询月份排班日历矩阵 */
export function getMonthScheduleApi(params: { yearMonth: string; deptId?: number }) {
  return request<{
    days: number;
    yearMonth: string;
    list: Array<{
      empId: number;
      empNo: string;
      name: string;
      deptName: string;
      post: string;
      scheduleDates: Record<string, { isRest: boolean; shiftName: string; shiftId?: number }>;
    }>;
  }>({
    url: '/attendance/schedule/month',
    method: 'get',
    params,
  });
}

/** 批量设置排班 */
export function batchSetScheduleApi(data: {
  empIds: number[];
  startDate: string;
  endDate: string;
  shiftId?: number;
  isRest?: boolean;
  includeWeekends?: boolean;
}) {
  return request<{ success: boolean; count: number }>({
    url: '/attendance/schedule/batch-set',
    method: 'post',
    data,
  });
}

/** 在线打卡 */
export function clockInApi(data?: { type?: 'CHECK_IN' | 'CHECK_OUT' | 'AUTO'; remark?: string }) {
  return request({
    url: '/attendance/clock',
    method: 'post',
    data,
  });
}

/** 获取当前登录人今日打卡看板 */
export function getTodayStatusApi() {
  return request<{
    employee: { id: number; name: string; empNo: string; deptName?: string };
    today: string;
    record?: AttendanceRecordItem;
  }>({
    url: '/attendance/today',
    method: 'get',
  });
}

/** 分页获取考勤明细列表及汇总 KPI */
export function getAttendanceRecordListApi(params: QueryAttendanceParams) {
  return request<{
    list: AttendanceRecordItem[];
    total: number;
    kpi: AttendanceKPI;
  }>({
    url: '/attendance/record/list',
    method: 'get',
    params,
  });
}

/**
 * 根据 ID 查询考勤记录明细详情
 * Query 参数规范: GET /attendance/record/detail?id=4
 */
export function getAttendanceRecordDetailApi(id: number) {
  return request<AttendanceRecordItem>({
    url: '/attendance/record/detail',
    method: 'get',
    params: { id },
  });
}

/** 人工修正或补卡 */
export function repairAttendanceRecordApi(data: {
  recordId: number;
  checkInTime?: string;
  checkOutTime?: string;
  status?: number;
  remark?: string;
}) {
  return request({
    url: '/attendance/record/repair',
    method: 'post',
    data,
  });
}
