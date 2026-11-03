import { it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentSchemaInspector } from './agent-schema.inspector';
it('AI SQL 对管理员、普通账号及别名聚合攻击均关闭', async () => {
    let queried = false;
    const service = new AgentSchemaInspector({ query: () => { queried = true; } } as any);
    for (const roles of [['employee'], ['admin']])
        for (const sql of ['SELECT password AS name FROM sys_user', 'SELECT 1 AS emp_id, SUM(net_salary) FROM hr_salary_record', 'SELECT a.name,b.id_card FROM hr_employee a, hr_employee b', 'SELECT * FROM sys_dept']) {
            const result = await service.executeReadOnlyQuery(sql, { userId: 1, username: 'test', roles, permissions: ['*'] });
            assert.equal(result.success, false);
            assert.equal(result.data.error, 'RAW_SQL_DISABLED');
        }
    assert.equal(queried, false);
});
it('AI 员工身份只使用可信绑定，未绑定不会按姓名用户名推断', async () => {
    const service = new AgentSchemaInspector({ query: () => { throw Error('不应查询'); } } as any);
    const actor = { userId: 1, username: 'EMP009', roles: [], permissions: [] };
    assert.equal(await service.resolveCurrentEmployeeId(actor), null);
    assert.equal(await service.resolveCurrentEmployeeId({ ...actor, employeeId: 9 }), 9);
    assert.deepEqual(service.collectTableSchemas(actor), []);
});
