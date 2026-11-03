import 'reflect-metadata';
import { it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentService } from './agent.service';
it('对话只提供业务 API 工具，模型伪造旧 SQL 工具也不能查询', async () => {
    let queried = false, call = 0;
    const requests: any[] = [];
    const llm = { chat: { completions: { create: async (request: any) => { requests.push(request); return { choices: [{ message: call++ === 0 ? { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'query_system_data', arguments: JSON.stringify({ sql: 'SELECT password FROM sys_user' }) } }] } : { role: 'assistant', content: '请使用业务页面查询' } }] }; } } } };
    const service = new AgentService({ get: () => ({ model: 'test' }) } as any, { resolveCurrentEmployeeId: async () => 5, executeReadOnlyQuery: () => { queried = true; } } as any, { getAuthorizedEndpoints: () => [{ method: 'GET', path: '/hr/leave/list' }], buildAuthorizedApiPrompt: () => '- GET /hr/leave/list' } as any, llm as any);
    const result = await service.chat({ message: '查看请假', history: [] } as any, { userId: 5, employeeId: 5, username: 'test', roles: [], permissions: [] });
    assert.equal(queried, false);
    assert.deepEqual(requests[0].tools.map((t: any) => t.function.name), ['call_business_api']);
    assert.equal(result.executedTools[0].success, false);
    assert.match(result.reply, /业务页面/);
});

for (const stream of [false, true]) {
    it(`${stream ? '流式' : '普通'}对话携带最新绑定、上海日期、历史事由和当前自助接口目录`, async () => {
        const requests: any[] = [], calls: any[] = [], events: any[] = [];
        const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
        const body = { leaveType: 'ANNUAL', startDate: tomorrow, reason: '家里有事' };
        const gateway = {
            getAuthorizedEndpoints: () => [{ method: 'GET', path: '/hr/employee/me' }, { method: 'POST', path: '/hr/leave/my/apply' }],
            buildAuthorizedApiPrompt: () => '- GET /hr/employee/me\n- POST /hr/leave/my/apply',
            executeApiCall: async (input: any, user: any, token: string) => { calls.push({ input, user, token }); return { success: true, title: '本人整日请假申请', resultSummary: '提交成功', data: { leaveNo: 'LV-test', empId: user.employeeId, status: 'PENDING' } }; },
        };
        const llm = { chat: { completions: { create: async (request: any) => {
            requests.push(request);
            return { choices: [{ message: requests.length === 1
                ? { role: 'assistant', tool_calls: [{ id: 'apply', type: 'function', function: { name: 'call_business_api', arguments: JSON.stringify({ method: 'POST', path: '/hr/leave/my/apply', body }) } }] }
                : { role: 'assistant', content: '已提交申请 LV-test，待审批。' } }] };
        } } } };
        const service = new AgentService({ get: () => ({ model: 'test' }) } as any, { resolveCurrentEmployeeId: async (user: any) => user.employeeId } as any, gateway as any, llm as any);
        const actor = { userId: 1, username: 'test', employeeId: 9, roles: [], permissions: ['hr:leave:add'] };
        const input = { message: '年假，明天请一天假', history: [{ role: 'user', content: '我想明天请一天假，家里有事' }, { role: 'assistant', content: '请提供员工ID，接口未开放' }] } as any;
        if (stream) await service.chatStream(input, actor, event => events.push(event), 'Bearer test');
        else assert.match((await service.chat(input, actor, 'Bearer test')).reply, /LV-test/);
        const prompt = requests[0].messages[0].content;
        assert.match(prompt, /员工ID：9/);
        assert.ok(prompt.includes('明天：' + tomorrow));
        assert.match(prompt, /Asia\/Shanghai/);
        assert.match(prompt, /历史助手.*过期/);
        assert.match(prompt, /无需询问具体上下班时间/);
        assert.ok(requests[0].messages.some((message: any) => message.role === 'user' && message.content.includes('家里有事')));
        assert.deepEqual(calls[0].input.body, body);
        assert.equal(calls[0].user.employeeId, 9);
        assert.equal(calls[0].token, 'Bearer test');
        assert.deepEqual(requests[0].tools[0].function.parameters.properties.method.enum, ['GET', 'POST']);
        if (stream) assert.ok(events.some(event => event.type === 'done' && event.executedTools[0].success));
        const unbound = { ...actor, employeeId: undefined };
        await (service as any).prepareConversation('查询我的员工ID', [], unbound).then(({ messages }: any) => {
            assert.match(messages[0].content, /不得索要员工ID/);
            assert.match(messages[0].content, /请管理员在用户管理中关联员工/);
        });
        assert.equal(service.getCapabilities(unbound).promptSuggestions.some(text => text.includes('申请明天')), false);
    });
    it(`${stream ? '流式' : '普通'}工具连续失败时不返回操作执行完毕`, async () => {
        const events: any[] = [];
        const llm = { chat: { completions: { create: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'failed', type: 'function', function: { name: 'call_business_api', arguments: '{"method":"POST","path":"/hr/leave/my/apply"}' } }] } }] }) } } };
        const gateway = { getAuthorizedEndpoints: () => [{ method: 'POST', path: '/hr/leave/my/apply' }], buildAuthorizedApiPrompt: () => 'POST /hr/leave/my/apply', executeApiCall: async () => ({ success: false, title: '本人请假', resultSummary: '账号尚未关联员工档案', data: {} }) };
        const service = new AgentService({ get: () => ({ model: 'test' }) } as any, { resolveCurrentEmployeeId: async () => null } as any, gateway as any, llm as any);
        const actor = { userId: 1, username: 'test', roles: [], permissions: ['hr:leave:add'] };
        const reply = stream
            ? (await service.chatStream({ message: '明天年假一天' }, actor, event => events.push(event), 'Bearer test'), events.filter(event => event.type === 'chunk').map(event => event.content).join(''))
            : (await service.chat({ message: '明天年假一天' }, actor, 'Bearer test')).reply;
        assert.match(reply, /未完整完成.*尚未关联/);
        assert.doesNotMatch(reply, /操作已执行完毕/);
    });
}
