import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AttendanceService } from './attendance.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/**
 * 构造可记录链式调用轨迹的模拟 TypeORM QueryBuilder
 */
function createMockQueryBuilder(options?: {
  manyAndCount?: [any[], number];
  many?: any[];
  rawOne?: any;
}) {
  const andWhereCalls: Array<{ sql: string; params?: Record<string, any> }> = [];
  const whereCalls: Array<{ sql: string; params?: Record<string, any> }> = [];
  const leftJoinCalls: Array<{ property: string; alias: string }> = [];

  const qb: any = {
    andWhereCalls,
    whereCalls,
    leftJoinCalls,
    leftJoinAndSelect: (property: string, alias: string) => {
      leftJoinCalls.push({ property, alias });
      return qb;
    },
    leftJoin: (property: string, alias: string) => {
      leftJoinCalls.push({ property, alias });
      return qb;
    },
    where: (sql: string, params?: Record<string, any>) => {
      whereCalls.push({ sql, params });
      return qb;
    },
    andWhere: (sql: string, params?: Record<string, any>) => {
      andWhereCalls.push({ sql, params });
      return qb;
    },
    orderBy: () => qb,
    addOrderBy: () => qb,
    select: () => qb,
    addSelect: () => qb,
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => options?.manyAndCount ?? [[], 0],
    getMany: async () => options?.many ?? [],
    getRawOne: async () =>
      options?.rawOne ?? {
        totalCount: '0',
        normalCount: '0',
        lateCount: '0',
        earlyCount: '0',
        absentCount: '0',
        totalWorkHours: '0',
      },
  };

  return qb;
}

describe('AttendanceService 考勤检索与数据范围隔离测试', () => {
  it('普通员工在考勤明细按部门与员工关键字检索时，必须同时叠加本人 empId 硬隔离与搜索条件', async () => {
    const recordListQb = createMockQueryBuilder({ manyAndCount: [[], 0] });
    const statsQb = createMockQueryBuilder();

    let qbIndex = 0;
    const mockRecordRepo: any = {
      createQueryBuilder: () => {
        qbIndex += 1;
        return qbIndex === 1 ? recordListQb : statsQb;
      },
    };

    const mockEmployeeRepo: any = {
      findOne: async () => ({
        id: 104,
        empNo: 'EMP1004',
        name: '普通员工',
        deptId: 5,
      }),
    };

    const mockUserRepo: any = {
      findOne: async () => ({
        id: 8,
        username: 'ptyg',
        realName: '普通员工',
        phone: '13800000008',
        status: 1,
        deptId: 5,
      }),
    };

    const mockDataSource: any = {
      query: async () => [
        { id: 1, parent_id: 0 },
        { id: 2, parent_id: 1 },
        { id: 5, parent_id: 2 },
      ],
    };

    const service = new AttendanceService(
      {} as any,
      {} as any,
      mockRecordRepo,
      mockEmployeeRepo,
      mockUserRepo,
      mockDataSource,
    );

    const normalUser: CurrentUserPayload = {
      userId: 8,
      username: 'ptyg',
      roles: ['employee'],
      permissions: ['hr:attendance:list', 'hr:attendance:clock'],
    };

    await service.getRecordList(
      {
        page: 1,
        pageSize: 10,
        yearMonth: '2026-10',
        deptId: 2,
        keyword: '张三',
      },
      normalUser,
    );

    // 1. 必须包含本人 empId 硬隔离条件
    assert.ok(
      recordListQb.andWhereCalls.some(
        (c) => c.sql.includes('record.empId = :scopedEmpId') && c.params?.scopedEmpId === 104,
      ),
      '普通员工查询必须强制叠加本人 empId 隔离条件',
    );

    // 2. 同时必须保留用户输入的 keyword 与 deptId 过滤条件（搜他人时交集为空返回 0 条，而非忽略搜索词返回本人数据）
    assert.ok(
      recordListQb.andWhereCalls.some(
        (c) => c.sql.includes('employee.name LIKE :kw') && c.params?.kw === '%张三%',
      ),
      '普通员工输入员工检索关键字时，查询器应正常叠加 keyword 条件',
    );
    assert.ok(
      recordListQb.andWhereCalls.some((c) => c.sql.includes('employee.deptId')),
      '普通员工选择所属部门时，查询器应正常叠加 deptId 条件',
    );

    // 3. 统计查询器 statsQb 也必须关联 employee 并保持完全一致的隔离与筛选条件
    assert.ok(
      statsQb.leftJoinCalls.some((j) => j.property === 'record.employee' && j.alias === 'employee'),
      '存在部门或关键字过滤时，统计查询器必须 leftJoin employee 表',
    );
    assert.ok(
      statsQb.andWhereCalls.some(
        (c) => c.sql.includes('record.empId = :scopedEmpId') && c.params?.scopedEmpId === 104,
      ),
      '统计查询器也必须强制锁定本人 empId',
    );
    assert.ok(
      statsQb.andWhereCalls.some(
        (c) => c.sql.includes('employee.name LIKE :kw') && c.params?.kw === '%张三%',
      ),
      '统计查询器也必须同步叠加 keyword 条件',
    );
  });

  it('具备考勤排班或班次管理权限的角色应被识别为考勤管理者，支持按父部门自动包含子部门检索全员考勤', async () => {
    const recordListQb = createMockQueryBuilder({ manyAndCount: [[{ id: 1 }], 1] });
    const statsQb = createMockQueryBuilder();

    let qbIndex = 0;
    const mockRecordRepo: any = {
      createQueryBuilder: () => {
        qbIndex += 1;
        return qbIndex === 1 ? recordListQb : statsQb;
      },
    };

    const mockDataSource: any = {
      query: async () => [
        { id: 1, parent_id: 0 },
        { id: 2, parent_id: 1 }, // 研发中心
        { id: 5, parent_id: 2 }, // 前端架构组（研发中心子部门）
        { id: 6, parent_id: 1 }, // 财务部
      ],
    };

    const service = new AttendanceService(
      {} as any,
      {} as any,
      mockRecordRepo,
      {} as any,
      {} as any,
      mockDataSource,
    );

    // 自定义考勤主管角色：角色编码既不是 admin 也不是 hr，但拥有排班管理权限 hr:attendance:schedule
    const scheduleSupervisor: CurrentUserPayload = {
      userId: 12,
      username: 'kqzg',
      roles: ['attendance_supervisor'],
      permissions: ['hr:attendance:list', 'hr:attendance:schedule'],
    };

    assert.equal(
      service.isAttendanceManager(scheduleSupervisor),
      true,
      '拥有 hr:attendance:schedule 权限的角色应具备考勤管理查询范围',
    );

    await service.getRecordList(
      {
        page: 1,
        pageSize: 10,
        deptId: 2,
        keyword: '李四',
      },
      scheduleSupervisor,
    );

    // 不应锁定本人 empId
    assert.equal(
      recordListQb.andWhereCalls.some((c) => c.sql.includes('scopedEmpId')),
      false,
      '考勤管理人员不应被锁定本人 empId',
    );

    // 选择父部门 deptId=2 时应自动展开包含子部门 [2, 5]
    const deptCall = recordListQb.andWhereCalls.find((c) => c.sql.includes('employee.deptId'));
    assert.ok(deptCall, '应包含部门过滤条件');
    assert.deepEqual(
      deptCall?.params?.deptIds?.sort((a: number, b: number) => a - b),
      [2, 5],
      '选择上级部门时应自动包含下属子部门 ID',
    );
  });

  it('月度排班日历 getMonthSchedule 应支持 keyword 员工检索且对普通员工强制叠加本人隔离', async () => {
    const empQb = createMockQueryBuilder({ many: [] });
    const mockEmployeeRepo: any = {
      createQueryBuilder: () => empQb,
      findOne: async () => ({
        id: 104,
        empNo: 'EMP1004',
        name: '普通员工',
        deptId: 5,
      }),
    };
    const mockUserRepo: any = {
      findOne: async () => ({
        id: 8,
        username: 'ptyg',
        realName: '普通员工',
        phone: '13800000008',
        status: 1,
        deptId: 5,
      }),
    };
    const mockDataSource: any = {
      query: async () => [{ id: 5, parent_id: 2 }],
    };

    const service = new AttendanceService(
      {} as any,
      { find: async () => [] } as any,
      {} as any,
      mockEmployeeRepo,
      mockUserRepo,
      mockDataSource,
    );

    const normalUser: CurrentUserPayload = {
      userId: 8,
      username: 'ptyg',
      roles: ['employee'],
      permissions: ['hr:attendance:list'],
    };

    await (service as any).getMonthSchedule('2026-10', 5, normalUser, 'EMP1004');

    assert.ok(
      empQb.andWhereCalls.some(
        (c) => c.sql.includes('employee.id = :myEmpId') && c.params?.myEmpId === 104,
      ),
      '普通员工查询排班日历必须锁定本人 employee.id',
    );
    assert.ok(
      empQb.andWhereCalls.some(
        (c) => c.sql.includes('employee.name LIKE :kw') && c.params?.kw === '%EMP1004%',
      ),
      '排班日历查询应支持按员工姓名或工号 keyword 过滤',
    );
  });
});
