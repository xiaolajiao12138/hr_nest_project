import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';
import { SseService } from '../sse/sse.service';
import { LeaveService } from './leave.service';

describe('请假通知精准定向推送测试（仅通知本人/审批人，禁止全员广播）', () => {
  it('SseService.sendToUsers 应仅向目标用户流推送消息，其他在线员工不接收', async () => {
    const sse = new SseService();
    const applicantEvents: any[] = [];
    const bystanderEvents: any[] = [];

    const sub1 = sse.addClient(10).subscribe((ev) => applicantEvents.push(ev.data));
    const sub2 = sse.addClient(20).subscribe((ev) => bystanderEvents.push(ev.data));

    sse.sendToUsers([10], {
      type: 'LEAVE_AUDIT_NOTIFY',
      title: '请假审批提醒',
      message: '您的请假单已驳回',
    });

    assert.equal(applicantEvents.length, 1);
    assert.equal(applicantEvents[0].message, '您的请假单已驳回');
    assert.equal(bystanderEvents.length, 0, '无关普通员工绝不应收到他人的请假驳回通知');

    sub1.unsubscribe();
    sub2.unsubscribe();
    sse.removeClient(10);
    sse.removeClient(20);
  });

  it('LeaveService.auditLeave 驳回请假时应仅定向通知申请人本人，绝不调用 broadcast 广播 LEAVE_AUDIT_NOTIFY', async () => {
    const broadcasted: any[] = [];
    const targeted: Array<{ userIds: number[]; payload: any }> = [];

    const mockSse: any = {
      broadcast: (payload: any) => broadcasted.push(payload),
      sendPendingBadgeUpdate: () => {},
      sendToUser: (uid: number, payload: any) =>
        targeted.push({ userIds: [uid], payload }),
      sendToUsers: (uids: number[], payload: any) =>
        targeted.push({ userIds: uids, payload }),
    };

    const existingLeave = {
      id: 99,
      leaveNo: 'LV20261102001',
      empId: 5,
      empName: 'fq',
      leaveType: 'CASUAL',
      days: 0.5,
      startTime: new Date('2026-11-02T09:00:00Z'),
      endTime: new Date('2026-11-02T13:00:00Z'),
      status: 'PENDING',
    };

    const mockLeaveRepo: any = {
      findOne: async () => ({ ...existingLeave }),
      count: async () => 0,
    };

    // 模拟数据库根据 empId=5 查出申请人 fq 对应的 sys_user.id = 12
    const mockDataSource: any = {
      createQueryRunner: () => ({
        connect: async () => {},
        startTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        release: async () => {},
        manager: {
          save: async (entity: any) => entity,
        },
      }),
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('FROM sys_user') && params?.[0] === 5) {
          return [{ id: 12 }];
        }
        return [{ id: 1 }];
      },
    };

    const service = new LeaveService(
      mockLeaveRepo,
      {} as any,
      {} as any,
      mockDataSource,
      mockSse,
    );

    await service.auditLeave(
      99,
      { id: 99, action: 'REJECTED', auditRemark: '工作排期冲突' } as any,
      1,
    );

    // 验证没有任何全员广播的请假通知
    const broadcastAuditEvents = broadcasted.filter(
      (b) => b.type === 'LEAVE_AUDIT_NOTIFY',
    );
    assert.equal(
      broadcastAuditEvents.length,
      0,
      '审批驳回严禁通过 broadcast 全员广播',
    );

    // 验证精准推送给了申请人 userId = 12
    const auditNotify = targeted.find(
      (t) => t.payload.type === 'LEAVE_AUDIT_NOTIFY',
    );
    assert.ok(auditNotify, '必须向申请人本人发送定向通知');
    assert.deepEqual(auditNotify!.userIds, [12]);
    assert.match(auditNotify!.payload.message, /已驳回/);
  });

  it('LeaveService.applyLeave 提交请假时应仅定向通知拥有审批权限的用户，绝不全员广播', async () => {
    const broadcasted: any[] = [];
    const targeted: Array<{ userIds: number[]; payload: any }> = [];

    const mockSse: any = {
      broadcast: (payload: any) => broadcasted.push(payload),
      sendPendingBadgeUpdate: () => {},
      sendToUser: (uid: number, payload: any) =>
        targeted.push({ userIds: [uid], payload }),
      sendToUsers: (uids: number[], payload: any) =>
        targeted.push({ userIds: uids, payload }),
    };

    const mockLeaveRepo: any = {
      count: async () => 1,
    };
    const mockEmpRepo: any = {
      findOne: async () => ({ id: 5, empNo: 'fq', name: 'fq', deptId: 2 }),
    };
    const mockDataSource: any = {
      createQueryRunner: () => ({
        connect: async () => {},
        startTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        release: async () => {},
        manager: {
          create: (_cls: any, data: any) => ({ id: 100, ...data }),
          save: async (entity: any) => entity,
        },
      }),
      query: async (sql: string) => {
        // 模拟查出具备 admin 或 hr:leave:audit 权限的审批人 userId = 1, 2（不含普通员工 20）
        if (sql.includes('hr:leave:audit')) {
          return [{ id: 1 }, { id: 2 }];
        }
        return [{ id: 12 }];
      },
    };

    const service = new LeaveService(
      mockLeaveRepo,
      {} as any,
      mockEmpRepo,
      mockDataSource,
      mockSse,
    );

    await service.applyLeave({
      empId: 5,
      leaveType: 'CASUAL',
      startTime: '2026-11-03 09:00:00',
      endTime: '2026-11-03 18:00:00',
      days: 1,
      reason: '个人事务',
    } as any);

    const broadcastAuditEvents = broadcasted.filter(
      (b) => b.type === 'LEAVE_AUDIT_NOTIFY',
    );
    assert.equal(
      broadcastAuditEvents.length,
      0,
      '提交请假严禁通过 broadcast 向全体员工广播',
    );

    const applyNotify = targeted.find(
      (t) => t.payload.type === 'LEAVE_AUDIT_NOTIFY',
    );
    assert.ok(applyNotify, '必须向审批人发送定向待办通知');
    assert.deepEqual(applyNotify!.userIds, [1, 2]);
  });
});
