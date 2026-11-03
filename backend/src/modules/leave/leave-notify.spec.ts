import 'reflect-metadata';
import { it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SseService } from '../sse/sse.service';
import { LeaveService } from './leave.service';
const actor = { userId: 1, username: 'manager', roles: [], permissions: ['hr:leave:audit'], employeeId: 10, dataScopes: { leave: { all: false, deptIds: [2], self: false } } };
function fixture() {
    const sse = new SseService();
    const targets: any[] = [];
    const broadcasts: any[] = [];
    sse.sendToUsers = (ids, payload) => { targets.push({ ids, payload }); };
    sse.broadcast = (payload) => { broadcasts.push(payload); };
    const ds: any = { query: async (sql: string, params: any[]) => sql.includes('hr_employee') ? [{ id: params[0], dept_id: 2 }] : sql.includes('hr:leave:audit') ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 12 }] };
    const qb: any = { leftJoin: () => qb, where: () => qb, andWhere: (v: any) => { if (v?.whereFactory)
            v.whereFactory(qb); return qb; }, orWhere: () => qb, getCount: async () => 1 };
    const service = new LeaveService({ createQueryBuilder: () => qb } as any, {} as any, { findOne: async () => ({ id: 5, name: 'fq', deptId: 2, status: 1 }) } as any, ds, sse, { getUserAuthorities: async (id: number) => id === 1 ? { ...actor, status: 1 } : id === 2 ? { ...actor, userId: 2, status: 1, dataScopes: { leave: { all: false, deptIds: [9], self: false } } } : { ...actor, userId: 3, status: 1, permissions: [] } } as any);
    (service as any).withTransaction = async (fn: any) => fn({
        findOne: async (entity: any) => entity.name === 'Leave' ? { id: 99, empId: 5, empName: 'fq', leaveNo: 'LV99', status: 'PENDING', leaveType: 'CASUAL' } : { id: 5 },
        query: ds.query, createQueryBuilder: () => ({ where() { return this; }, andWhere() { return this; }, getCount: async () => 0 }), create: (_entity: any, data: any) => ({ id: 100, ...data }), save: async (entity: any) => entity,
    });
    return { service, targets, broadcasts };
}
it('SSE 仅向指定账号推送', () => { const sse = new SseService(); const a: any[] = [], b: any[] = []; const s1 = sse.addClient(10).subscribe(x => a.push(x)), s2 = sse.addClient(20).subscribe(x => b.push(x)); sse.sendToUsers([10], { type: 'LEAVE_AUDIT_NOTIFY', message: '结果' }); assert.equal(a.length, 1); assert.equal(b.length, 0); s1.unsubscribe(); s2.unsubscribe(); });
it('审批结果只发给显式绑定的申请账号', async () => { const { service, targets, broadcasts } = fixture(); await service.auditLeave(99, { action: 'REJECTED', auditRemark: '排期冲突' } as any, actor); const result = targets.find(x => x.payload.type === 'LEAVE_AUDIT_NOTIFY'); assert.deepEqual(result.ids, [12]); assert.match(result.payload.message, /已驳回/); assert.equal(broadcasts.length, 0); });
it('新申请只通知具有审批权限且在数据范围内的审批人', async () => { const { service, targets, broadcasts } = fixture(); await service.applyLeave({ empId: 5, leaveType: 'CASUAL', startTime: '2026-11-03 09:00:00', endTime: '2026-11-03 18:00:00', days: 1, reason: '个人事务' } as any, { ...actor, permissions: [...actor.permissions, 'hr:leave:add'] }); assert.deepEqual(targets.find(x => x.payload.type === 'LEAVE_AUDIT_NOTIFY').ids, [1]); assert.equal(broadcasts.length, 0); });
