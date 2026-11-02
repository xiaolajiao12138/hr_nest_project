import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, DataSource } from 'typeorm';
import { AttendanceShift } from './entities/shift.entity';
import { AttendanceSchedule } from './entities/schedule.entity';
import { AttendanceRecord } from './entities/record.entity';
import { Employee } from '../employee/entities/employee.entity';
import { User } from '../rbac/entities/user.entity';
import {
  SaveShiftDto,
  BatchSetScheduleDto,
  ClockInDto,
  QueryAttendanceRecordDto,
  RepairAttendanceDto,
} from './dto/attendance.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceShift)
    private readonly shiftRepo: Repository<AttendanceShift>,
    @InjectRepository(AttendanceSchedule)
    private readonly scheduleRepo: Repository<AttendanceSchedule>,
    @InjectRepository(AttendanceRecord)
    private readonly recordRepo: Repository<AttendanceRecord>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initDefaultShiftAndMenu();
  }

  /**
   * 自动自愈初始化默认标准班次与考勤菜单权限
   */
  private async initDefaultShiftAndMenu() {
    try {
      // 1. 初始化默认正常工时班次 (09:00 - 18:00)
      const count = await this.shiftRepo.count();
      if (count === 0) {
        await this.shiftRepo.save([
          {
            name: '标准早九晚六工时制',
            startTime: '09:00',
            endTime: '18:00',
            lateTolerance: 10,
            earlyTolerance: 0,
            workHours: 8.0,
            isDefault: true,
            status: 1,
            remark: '标准工时：上午09:00 - 下午18:00，午休1小时',
          },
          {
            name: '弹性错峰制 (09:30-18:30)',
            startTime: '09:30',
            endTime: '18:30',
            lateTolerance: 15,
            earlyTolerance: 0,
            workHours: 8.0,
            isDefault: false,
            status: 1,
            remark: '技术与研发部门弹性工时',
          },
        ]);
        this.logger.log('考勤默认班次规则初始化完成');
      }

      // 2. 数据库自愈装载考勤管理系统菜单与按钮权限 (ID 205)
      await this.dataSource.query(`
        INSERT INTO sys_menu (id, parent_id, title, name, path, component, icon, sort, menu_type, perms, is_frame, is_hidden, status)
        VALUES (205, 2, '考勤管理', 'AttendanceManage', '/hr/attendance', 'views/hr/attendance/index.vue', 'Calendar', 5, 'C', 'hr:attendance:list', false, false, 1)
        ON CONFLICT (id) DO UPDATE SET title = '考勤管理', path = '/hr/attendance', component = 'views/hr/attendance/index.vue', icon = 'Calendar', status = 1;

        INSERT INTO sys_menu (id, parent_id, title, name, path, component, icon, sort, menu_type, perms, is_frame, is_hidden, status)
        VALUES
          (240, 205, '在线打卡', '', '', '', '', 1, 'F', 'hr:attendance:clock', false, false, 1),
          (241, 205, '排班管理', '', '', '', '', 2, 'F', 'hr:attendance:schedule', false, false, 1),
          (242, 205, '班次配置', '', '', '', '', 3, 'F', 'hr:attendance:shift', false, false, 1),
          (243, 205, '补卡修正', '', '', '', '', 4, 'F', 'hr:attendance:repair', false, false, 1)
        ON CONFLICT (id) DO NOTHING;

        SELECT setval('sys_menu_id_seq', (SELECT MAX(id) FROM sys_menu));

        INSERT INTO sys_role_menu (role_id, menu_id)
        VALUES 
          (1, 205), (1, 240), (1, 241), (1, 242), (1, 243),
          (2, 205), (2, 240), (2, 241), (2, 242), (2, 243)
        ON CONFLICT DO NOTHING;
      `);
      this.logger.log('考勤系统菜单与权限数据自动装配完成');
    } catch (err: any) {
      this.logger.warn(`考勤数据初始化提示: ${err?.message || err}`);
    }
  }

  /**
   * 判断当前登录用户是否具备跨员工/全量考勤管理与查询权限
   * 包含：超级管理员 (admin)、人事专员 (hr)、或拥有员工档案/考勤排班/班次配置管理权限
   */
  isAttendanceManager(user?: CurrentUserPayload): boolean {
    if (!user) return false;
    const roles = user.roles || [];
    const perms = user.permissions || [];
    return (
      roles.includes('admin') ||
      roles.includes('hr') ||
      perms.includes('*') ||
      perms.includes('hr:employee:list') ||
      perms.includes('hr:attendance:schedule') ||
      perms.includes('hr:attendance:shift') ||
      perms.includes('hr:attendance:manage')
    );
  }

  /**
   * 递归解析指定部门及其全部下属子部门 ID 集合，支持选择上级部门时联查下辖子部门考勤
   */
  private async resolveDeptScopeIds(deptId: number): Promise<number[]> {
    try {
      const allDepts: Array<{ id: number; parent_id: number }> = await this.dataSource.query(
        'SELECT id, parent_id FROM sys_dept',
      );
      if (!allDepts?.length) return [Number(deptId)];
      const ids = new Set<number>([Number(deptId)]);
      const collect = (pid: number) => {
        for (const item of allDepts) {
          const itemId = Number(item.id);
          if (Number(item.parent_id) === pid && !ids.has(itemId)) {
            ids.add(itemId);
            collect(itemId);
          }
        }
      };
      collect(Number(deptId));
      return Array.from(ids);
    } catch {
      return [Number(deptId)];
    }
  }

  /**
   * 精准或智能关联系统用户与在职员工档案
   * 1. 优先按手机号、真实姓名、用户名精准比对 hr_employee；
   * 2. 若未匹配（例如新注册账号或测试账号），自愈生成或匹配对应的在职员工档案，确保打卡卡片正常且数据隔离闭环；
   */
  async getOrCreateEmployeeByUser(userId: number): Promise<Employee | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['dept'],
    });
    if (!user) return null;

    // 1. 精准查找：优先手机号（非空），其次姓名，再次工号/账号
    let employee: Employee | null = null;
    if (user.phone && user.phone.trim()) {
      employee = await this.employeeRepo.findOne({
        where: { phone: user.phone.trim() },
        relations: ['dept'],
      });
    }

    if (!employee && user.realName && user.realName.trim()) {
      employee = await this.employeeRepo.findOne({
        where: { name: user.realName.trim() },
        relations: ['dept'],
      });
    }

    if (!employee && user.username) {
      employee = await this.employeeRepo.findOne({
        where: [{ empNo: user.username }, { name: user.username }],
        relations: ['dept'],
      });
    }

    // 2. 若仍未匹配，且用户状态正常，为该系统用户自愈创建对应的员工档案
    if (!employee && user.status === 1) {
      const generatedEmpNo = `EMP${String(1000 + user.id).slice(-4)}`;
      const existEmp = await this.employeeRepo.findOne({ where: { empNo: generatedEmpNo } });
      const finalEmpNo = existEmp ? `EMP${Date.now().toString().slice(-4)}` : generatedEmpNo;

      const newEmp = this.employeeRepo.create({
        empNo: finalEmpNo,
        name: user.realName || user.username || '普通员工',
        phone: user.phone || `138${String(user.id).padStart(8, '0')}`,
        idCard: '330100199501010000',
        entryDate: '2026-01-01',
        post: '常规岗位',
        deptId: user.deptId || 1,
        education: '本科',
        salary: 8000.0,
        status: 1, // 在职
        remark: '系统根据用户账号自动自愈关联生成的员工档案',
      });

      employee = await this.employeeRepo.save(newEmp);
      employee = await this.employeeRepo.findOne({
        where: { id: employee.id },
        relations: ['dept'],
      });
      this.logger.log(`[员工档案自愈] 为用户 ${user.username}(ID: ${user.id}) 自动生成并关联在职员工档案: ${employee?.name}(${employee?.empNo})`);
    }

    return employee;
  }

  // ==================== 1. 班次规则管理 ====================

  /** 获取班次详情 */
  async getShiftDetail(id: number) {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) {
      throw new BusinessException('班次不存在');
    }
    return shift;
  }

  /** 获取所有班次 */
  async getShiftList() {
    return this.shiftRepo.find({
      order: { isDefault: 'DESC', id: 'ASC' },
    });
  }

  /** 保存或新增班次 */
  async saveShift(dto: SaveShiftDto, id?: number) {
    if (dto.isDefault) {
      // 若设为默认，取消其他班次的默认状态
      await this.shiftRepo.update({}, { isDefault: false });
    }

    if (id) {
      const shift = await this.shiftRepo.findOne({ where: { id } });
      if (!shift) throw new BusinessException('班次不存在');
      Object.assign(shift, dto);
      return this.shiftRepo.save(shift);
    }

    const newShift = this.shiftRepo.create(dto);
    return this.shiftRepo.save(newShift);
  }

  /** 删除班次 */
  async deleteShift(id: number) {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) throw new BusinessException('班次不存在');
    if (shift.isDefault) {
      throw new BusinessException('默认班次不允许删除');
    }
    return this.shiftRepo.delete(id);
  }

  // ==================== 2. 员工月度排班管理 ====================

  /**
   * 查询指定月份、部门与员工关键字下的排班日历（普通员工强制叠加本人排班隔离）
   */
  async getMonthSchedule(
    yearMonth: string,
    deptId?: number,
    user?: CurrentUserPayload,
    keyword?: string,
  ) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new BusinessException('月份格式不正确，应形如 2026-10');
    }

    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    // 获取涉及员工
    const empQb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.dept', 'dept')
      .where('employee.status IN (1, 3)');

    // 1. 数据权限硬隔离：普通员工强制锁定本人档案 ID
    if (user && !this.isAttendanceManager(user)) {
      const myEmp = await this.getOrCreateEmployeeByUser(user.userId);
      if (!myEmp) {
        return { days: lastDay, yearMonth, list: [] };
      }
      empQb.andWhere('employee.id = :myEmpId', { myEmpId: myEmp.id });
    }

    // 2. 筛选条件叠加：所属部门（自动包含子部门）与员工姓名/工号模糊检索
    if (deptId) {
      const deptIds = await this.resolveDeptScopeIds(Number(deptId));
      empQb.andWhere('employee.deptId IN (:...deptIds)', { deptIds });
    }

    const trimmedKw = keyword?.trim();
    if (trimmedKw) {
      empQb.andWhere(
        '(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)',
        { kw: `%${trimmedKw}%` },
      );
    }

    const employees = await empQb.orderBy('employee.empNo', 'ASC').getMany();
    const empIds = employees.map((e) => e.id);

    if (empIds.length === 0) {
      return { days: lastDay, yearMonth, list: [] };
    }

    // 获取该月份排班记录
    const schedules = await this.scheduleRepo.find({
      where: {
        empId: In(empIds),
        date: Between(startDate, endDate),
      },
      relations: ['shift'],
    });

    const scheduleMap = new Map<string, AttendanceSchedule>();
    for (const s of schedules) {
      scheduleMap.set(`${s.empId}_${s.date}`, s);
    }

    // 组装员工日历视图矩阵
    const result = employees.map((emp) => {
      const dates: Record<string, any> = {};
      for (let d = 1; d <= lastDay; d++) {
        const dayStr = String(d).padStart(2, '0');
        const fullDate = `${yearMonth}-${dayStr}`;
        const item = scheduleMap.get(`${emp.id}_${fullDate}`);
        dates[dayStr] = item
          ? {
              isRest: item.isRest,
              shiftName: item.isRest ? '休' : item.shift?.name || '班',
              shiftId: item.shiftId,
            }
          : { isRest: false, shiftName: '默认', shiftId: null };
      }

      return {
        empId: emp.id,
        empNo: emp.empNo,
        name: emp.name,
        deptName: emp.dept?.deptName || '-',
        post: emp.post,
        scheduleDates: dates,
      };
    });

    return { days: lastDay, yearMonth, list: result };
  }

  /**
   * 批量为员工排班
   */
  async batchSetSchedule(dto: BatchSetScheduleDto, user?: CurrentUserPayload) {
    if (user && !this.isAttendanceManager(user)) {
      throw new BusinessException('普通员工无权进行批量排班操作');
    }
    const { empIds, startDate, endDate, shiftId, isRest = false, includeWeekends = false } = dto;
    if (!empIds.length) throw new BusinessException('请至少选择一位员工');

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) throw new BusinessException('起始日期不能大于结束日期');

    const dateList: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay(); // 0 是周日，6 是周六
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      // 若未勾选包含周末，周末默认排休
      const actualIsRest = isRest || (!includeWeekends && isWeekend);

      dateList.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }

    const recordsToSave: AttendanceSchedule[] = [];
    for (const empId of empIds) {
      for (const dateStr of dateList) {
        const curDateObj = new Date(dateStr);
        const dayOfWeek = curDateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const actualRest = isRest || (!includeWeekends && isWeekend);

        recordsToSave.push(
          this.scheduleRepo.create({
            empId,
            date: dateStr,
            shiftId: actualRest ? undefined : shiftId,
            isRest: actualRest,
          }),
        );
      }
    }

    // 先清理原有重合区间的排班
    await this.scheduleRepo.delete({
      empId: In(empIds),
      date: Between(startDate, endDate),
    });

    // 批量分块保存
    const chunkSize = 100;
    for (let i = 0; i < recordsToSave.length; i += chunkSize) {
      await this.scheduleRepo.save(recordsToSave.slice(i, i + chunkSize));
    }

    return { success: true, count: recordsToSave.length };
  }

  // ==================== 3. 员工打卡核心逻辑 ====================

  /**
   * 在线打卡
   */
  async clockIn(userId: number, dto: ClockInDto) {
    const employee = await this.getOrCreateEmployeeByUser(userId);

    if (!employee) {
      throw new BusinessException('当前账号未关联在职员工档案，无法打卡');
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // 获取今日员工排班规则
    const schedule = await this.scheduleRepo.findOne({
      where: { empId: employee.id, date: todayStr },
      relations: ['shift'],
    });

    // 获取默认班次
    const defaultShift = await this.shiftRepo.findOne({
      where: { isDefault: true },
    });

    const activeShift = schedule?.shift || defaultShift;

    // 查找今日已有打卡记录
    let record = await this.recordRepo.findOne({
      where: { empId: employee.id, date: todayStr },
    });

    if (!record) {
      record = this.recordRepo.create({
        empId: employee.id,
        date: todayStr,
        shiftId: activeShift?.id,
        checkInStatus: 3,
        checkOutStatus: 3,
        status: 4,
        workHours: 0,
      });
    }

    // 时间比对函数：将 'HH:mm' 转化为今日对应时间戳
    const parseTime = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    };

    let clockAction = dto.type || 'AUTO';

    // 自动判断打卡行为
    if (clockAction === 'AUTO') {
      if (!record.checkInTime) {
        clockAction = 'CHECK_IN';
      } else {
        clockAction = 'CHECK_OUT';
      }
    }

    if (clockAction === 'CHECK_IN') {
      record.checkInTime = now;
      record.checkInIp = dto.ip || '127.0.0.1';

      if (activeShift) {
        const standardStart = parseTime(activeShift.startTime);
        const lateLimit = new Date(standardStart.getTime() + activeShift.lateTolerance * 60000);

        if (now <= lateLimit) {
          record.checkInStatus = 1; // 正常
        } else {
          record.checkInStatus = 2; // 迟到
        }
      } else {
        record.checkInStatus = 1;
      }
    } else {
      // 下班打卡
      record.checkOutTime = now;
      record.checkOutIp = dto.ip || '127.0.0.1';

      if (activeShift) {
        const standardEnd = parseTime(activeShift.endTime);
        const earlyLimit = new Date(standardEnd.getTime() - activeShift.earlyTolerance * 60000);

        if (now >= earlyLimit) {
          record.checkOutStatus = 1; // 正常
        } else {
          record.checkOutStatus = 2; // 早退
        }
      } else {
        record.checkOutStatus = 1;
      }
    }

    // 重新判定全天综合考勤与出勤工时
    if (record.checkInTime && record.checkOutTime) {
      const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
      const diffHours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
      record.workHours = diffHours;

      if (record.checkInStatus === 1 && record.checkOutStatus === 1) {
        record.status = 1; // 正常
      } else if (record.checkInStatus === 2) {
        record.status = 2; // 迟到
      } else if (record.checkOutStatus === 2) {
        record.status = 3; // 早退
      } else {
        record.status = 1;
      }
    } else if (record.checkInTime) {
      record.status = record.checkInStatus === 2 ? 2 : 1;
    }

    const saved = await this.recordRepo.save(record);
    return {
      success: true,
      action: clockAction,
      record: saved,
      time: now,
    };
  }

  /**
   * 获取当前登录人今日打卡看板状态
   */
  async getTodayStatus(userId: number) {
    const employee = await this.getOrCreateEmployeeByUser(userId);
    if (!employee) return null;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const record = await this.recordRepo.findOne({
      where: { empId: employee.id, date: todayStr },
      relations: ['shift'],
    });

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        empNo: employee.empNo,
        deptName: employee.dept?.deptName || '未分配部门',
      },
      today: todayStr,
      record,
    };
  }

  // ==================== 4. 考勤明细列表与汇总 KPI ====================

  /**
   * 分页查询考勤明细（企业级数据隔离：普通员工强制锁定且仅限本人，管理员支持全员动态检索）
   */
  async getRecordList(query: QueryAttendanceRecordDto, user?: CurrentUserPayload) {
    const {
      page = 1,
      pageSize = 10,
      yearMonth,
      date,
      deptId,
      empId,
      status,
      keyword,
    } = query;

    const isManager = this.isAttendanceManager(user);
    let scopedEmployeeId: number | null = null;

    if (!isManager && user) {
      // 普通员工数据隔离：严格绑定并锁定本人档案 ID
      const myEmp = await this.getOrCreateEmployeeByUser(user.userId);
      if (!myEmp) {
        return {
          list: [],
          total: 0,
          page,
          pageSize,
          kpi: {
            totalCount: 0,
            normalCount: 0,
            lateCount: 0,
            earlyCount: 0,
            absentCount: 0,
            totalWorkHours: 0,
            attendanceRate: 100,
          },
        };
      }
      scopedEmployeeId = myEmp.id;
    }

    const qb = this.recordRepo
      .createQueryBuilder('record')
      .leftJoinAndSelect('record.employee', 'employee')
      .leftJoinAndSelect('employee.dept', 'dept')
      .leftJoinAndSelect('record.shift', 'shift')
      .orderBy('record.date', 'DESC')
      .addOrderBy('employee.empNo', 'ASC');

    // 独立构建统计查询，绝不带 ORDER BY，防范 GROUP BY 错误
    const statsQb = this.recordRepo.createQueryBuilder('record');

    // 1. 数据范围硬隔离：普通员工牢牢锁定本人档案 ID（搜他人或非本人部门时交集为空自然返回 0 条）
    if (scopedEmployeeId) {
      qb.andWhere('record.empId = :scopedEmpId', { scopedEmpId: scopedEmployeeId });
      statsQb.andWhere('record.empId = :scopedEmpId', { scopedEmpId: scopedEmployeeId });
    }

    // 2. 动态叠加部门（自动包含子孙部门）、指定员工 ID 与关键字检索条件
    const trimmedKw = keyword?.trim();
    if (deptId || trimmedKw) {
      statsQb.leftJoin('record.employee', 'employee');
    }

    if (deptId) {
      const deptIds = await this.resolveDeptScopeIds(Number(deptId));
      qb.andWhere('employee.deptId IN (:...deptIds)', { deptIds });
      statsQb.andWhere('employee.deptId IN (:...deptIds)', { deptIds });
    }

    if (empId) {
      qb.andWhere('record.empId = :empId', { empId });
      statsQb.andWhere('record.empId = :empId', { empId });
    }

    if (trimmedKw) {
      qb.andWhere(
        '(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)',
        { kw: `%${trimmedKw}%` },
      );
      statsQb.andWhere(
        '(employee.name LIKE :kw OR employee.empNo LIKE :kw OR employee.phone LIKE :kw)',
        { kw: `%${trimmedKw}%` },
      );
    }

    if (date) {
      qb.andWhere('record.date = :date', { date });
      statsQb.andWhere('record.date = :date', { date });
    } else if (yearMonth) {
      qb.andWhere("TO_CHAR(record.date, 'YYYY-MM') = :yearMonth", { yearMonth });
      statsQb.andWhere("TO_CHAR(record.date, 'YYYY-MM') = :yearMonth", { yearMonth });
    }

    if (status !== undefined && status !== null) {
      qb.andWhere('record.status = :status', { status });
      statsQb.andWhere('record.status = :status', { status });
    }

    const statsResult = await statsQb
      .select('COUNT(record.id)', 'totalCount')
      .addSelect('COUNT(CASE WHEN record.status = 1 THEN 1 END)', 'normalCount')
      .addSelect('COUNT(CASE WHEN record.status = 2 THEN 1 END)', 'lateCount')
      .addSelect('COUNT(CASE WHEN record.status = 3 THEN 1 END)', 'earlyCount')
      .addSelect('COUNT(CASE WHEN record.status = 4 THEN 1 END)', 'absentCount')
      .addSelect('COALESCE(SUM(record.workHours), 0)', 'totalWorkHours')
      .getRawOne();

    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const totalCount = Number(statsResult?.totalCount || 0);
    const normalCount = Number(statsResult?.normalCount || 0);
    const attendanceRate = totalCount > 0 ? Math.round((normalCount / totalCount) * 1000) / 10 : 100;

    return {
      list,
      total,
      page,
      pageSize,
      kpi: {
        totalCount,
        normalCount,
        lateCount: Number(statsResult?.lateCount || 0),
        earlyCount: Number(statsResult?.earlyCount || 0),
        absentCount: Number(statsResult?.absentCount || 0),
        totalWorkHours: Number(statsResult?.totalWorkHours || 0),
        attendanceRate,
      },
    };
  }

  /**
   * HR / 管理员手动修正或员工申请补卡 (兼容 YYYY-MM-DD HH:mm:ss 与时间戳)
   */
  async repairRecord(dto: RepairAttendanceDto, user?: CurrentUserPayload) {
    const { recordId, checkInTime, checkOutTime, status, remark } = dto;
    const record = await this.recordRepo.findOne({ where: { id: recordId } });
    if (!record) throw new BusinessException('考勤记录不存在');

    // 越权防御：普通员工只能为本人考勤补卡
    if (user && !this.isAttendanceManager(user)) {
      const myEmp = await this.getOrCreateEmployeeByUser(user.userId);
      if (!myEmp || record.empId !== myEmp.id) {
        throw new BusinessException('普通员工仅可为本人申请补卡，禁止修改他人考勤记录');
      }
    }

    const parseToDate = (input?: string | number) => {
      if (!input) return undefined;
      if (typeof input === 'number') return new Date(input);
      if (/^\d{10,13}$/.test(String(input).trim())) {
        const ts = Number(input);
        return new Date(ts < 10000000000 ? ts * 1000 : ts);
      }
      return new Date(input);
    };

    if (checkInTime) {
      record.checkInTime = parseToDate(checkInTime);
      record.checkInStatus = 1;
    }

    if (checkOutTime) {
      record.checkOutTime = parseToDate(checkOutTime);
      record.checkOutStatus = 1;
    }

    if (status !== undefined) {
      record.status = status;
    } else if (record.checkInTime && record.checkOutTime) {
      record.status = 1; // 修正后默认正常
    }

    if (record.checkInTime && record.checkOutTime) {
      const diffMs = record.checkOutTime.getTime() - record.checkInTime.getTime();
      record.workHours = Math.max(0, Math.round((diffMs / 3600000) * 10) / 10);
    }

    record.remark = remark || (this.isAttendanceManager(user) ? 'HR人工补卡修正' : '员工在线自主补卡申请');
    return this.recordRepo.save(record);
  }

  /**
   * 获取单条考勤记录详情（支持数据越权校验）
   */
  async getRecordDetail(id: number, user?: CurrentUserPayload) {
    const record = await this.recordRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.dept', 'shift'],
    });
    if (!record) {
      throw new BusinessException('考勤记录不存在');
    }

    if (user && !this.isAttendanceManager(user)) {
      const myEmp = await this.getOrCreateEmployeeByUser(user.userId);
      if (!myEmp || record.empId !== myEmp.id) {
        throw new BusinessException('无权查看其他员工的考勤详情');
      }
    }

    return record;
  }
}
