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
