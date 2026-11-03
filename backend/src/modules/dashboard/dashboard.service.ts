import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { applyScope, isAdmin } from '../../common/security/data-scope';
import { AttendanceRecord } from '../attendance/entities/record.entity';
import { Dept } from '../department/entities/dept.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Leave } from '../leave/entities/leave.entity';

/**
 * 首页工作台大屏统计数据结构定义
 */
export interface DashboardStatsResult {
  /** 头部 4 项关键核心运营指标概览 */
  overview: {
    /** 在职员工总数 */
    totalEmployees: number;
    /** 待审批请假申请总数 */
    pendingLeaves: number;
    /** 正常运行部门总数 */
    deptCount: number;
    /** 今日综合出勤率百分比 (0-100) */
    attendanceRate: number;
  };
  /** 部门人力编制统计（柱状图） */
  deptDistribution: {
    deptName: string;
    actualCount: number;
    planCount: number;
  }[];
  /** 员工学历结构占比（环形饼图） */
  educationDistribution: {
    name: string;
    value: number;
  }[];
  /** 近 6 个月考勤与请假走势（多折线面积图） */
  leaveTrend: {
    months: string[];
    annual: number[];
    sick: number[];
    casual: number[];
  };
}

/**
 * 仪表盘与大屏数据聚合服务
 * 汇聚员工、部门、考勤审批等关键模块的核心指标，为管理层提供全景化人资分析数据
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Dept)
    private readonly deptRepo: Repository<Dept>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Leave)
    private readonly leaveRepo: Repository<Leave>,
  ) {}

  /**
   * 获取首页工作台核心统计概览与多维度图表聚合数据
   *
   * @returns 返回整合后的概览卡片指标、部门编制分布、学历占比和近半年请假走势
   */
  async getDashboardStats(user: CurrentUserPayload): Promise<DashboardStatsResult> {
    const employees = () => applyScope(this.employeeRepo.createQueryBuilder('emp').where('emp.status IN (1,3)'), user, 'employee', 'emp.deptId','emp.id');
    const leaves = () => applyScope(this.leaveRepo.createQueryBuilder('leave').innerJoin('leave.employee','emp'), user, 'leave','emp.deptId','leave.empId');
    const [totalEmployees, pendingLeaves, departments, education] = await Promise.all([
      employees().getCount(),
      (isAdmin(user) || user.permissions.includes('hr:leave:audit')) ? leaves().andWhere('leave.status = :status', {status: 'PENDING'}).andWhere('leave.empId IS DISTINCT FROM :self', {self: user.employeeId || null}).getCount() : Promise.resolve(0),
      employees().leftJoin('emp.dept','dept').select('dept.deptName','name').addSelect('COUNT(*)','count').groupBy('dept.id').addGroupBy('dept.deptName').getRawMany(),
      employees().select('emp.education','name').addSelect('COUNT(*)','count').groupBy('emp.education').getRawMany(),
    ]);
    const monthDates = Array.from({length:6}, (_,i) => { const now=new Date(); return new Date(now.getFullYear(),now.getMonth()-5+i,1); });
    const monthly = await leaves().select("TO_CHAR(leave.startTime, 'YYYY-MM')",'month').addSelect('leave.leaveType','type').addSelect('COUNT(*)','count')
      .andWhere('leave.startTime >= :start', {start:monthDates[0]}).andWhere("leave.status <> 'REJECTED'").groupBy("TO_CHAR(leave.startTime, 'YYYY-MM')").addGroupBy('leave.leaveType').getRawMany();
    const values = (type: string) => monthDates.map(d => Number(monthly.find(r => r.month === d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') && r.type === type)?.count || 0));
    const now = new Date(); const today = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    const presentQb = this.employeeRepo.manager.createQueryBuilder(AttendanceRecord, 'r').innerJoin(Employee,'emp','emp.id = r.empId')
      .where('r.date = :today AND r.checkInTime IS NOT NULL', {today}).select('COUNT(DISTINCT r.empId)','count');
    applyScope(presentQb,user,'attendance','emp.deptId','r.empId');
    const expectedQb = this.employeeRepo.createQueryBuilder('emp').where('emp.status IN (1,3)');
    applyScope(expectedQb,user,'attendance','emp.deptId','emp.id');
    const [present,expected] = await Promise.all([presentQb.getRawOne(),expectedQb.getCount()]);
    return {
      overview:{totalEmployees,pendingLeaves,deptCount:departments.length,attendanceRate:expected ? Math.min(100,Math.round(Number(present?.count || 0)/expected*1000)/10) : 0},
      deptDistribution: departments.map(r => ({deptName:r.name || '未分配',actualCount:Number(r.count),planCount:0})),
      educationDistribution: education.map(r => ({name:r.name || '未填写',value:Number(r.count)})),
      leaveTrend:{months:monthDates.map(d => (d.getMonth()+1)+'月'),annual:values('ANNUAL'),sick:values('SICK'),casual:values('CASUAL')},
    };
  }
}
