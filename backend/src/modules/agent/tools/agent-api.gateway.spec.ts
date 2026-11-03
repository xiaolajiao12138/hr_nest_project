import 'reflect-metadata';
import { it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Controller, Get, Post, Delete } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AiTool } from '../../../common/decorators/ai-tool.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AgentApiGateway } from './agent-api.gateway';
import { EmployeeController } from '../../employee/employee.controller';
import { LeaveController } from '../../leave/leave.controller';
@Controller('hr/example')
class ExampleController {
    @AiTool()
    @Get(':id')
    @Permissions('hr:example:list')
    read() { }
    @AiTool('self-service')
    @Post('apply')
    @Permissions('hr:example:add')
    apply() { }
    @Get('private')
    privateEndpoint() { }
    @AiTool('self-service')
    @Delete(':id')
    remove() { }
}
const actor = { userId: 1, username: 'test', roles: [], permissions: ['hr:example:list'] };
function gateway() {
    const calls: any[] = [];
    const modules = new Map([['test', { controllers: new Map([['example', { metatype: ExampleController }]]) }]]);
    const fetcher = async (url: string, config: any) => { calls.push({ url, config }); return { ok: true, text: async () => JSON.stringify({ code: 200, data: { id: 8 } }) }; };
    return { calls, service: new AgentApiGateway(modules as any, new Reflector(), { get: () => undefined } as any, fetcher as any) };
}
it('AI 仅自动发现显式开放的查询和自助接口', () => { const { service } = gateway(); assert.equal(service.discoverAllEndpoints().length, 2); assert.deepEqual(service.getAuthorizedEndpoints(actor).map(e => e.path), ['/hr/example/:id']); });
it('AI 转发保留身份并拒绝权限不足的动作', async () => { const { service, calls } = gateway(); assert.equal((await service.executeApiCall({ method: 'GET', path: '/hr/example/:id', pathParams: { id: 8 } }, actor, 'Bearer test')).success, true); assert.equal(calls[0].config.headers.Authorization, 'Bearer test'); assert.ok(calls[0].url.endsWith('/example/8')); assert.equal((await service.executeApiCall({ method: 'POST', path: '/hr/example/apply' }, actor, 'Bearer test')).success, false); assert.equal(calls.length, 1); });
it('admin confirmed=true 不能调用未开放删除，路径穿越也拒绝', async () => { const { service, calls } = gateway(); assert.equal((await service.executeApiCall({ method: 'DELETE', path: '/hr/example/8', confirmed: true }, { ...actor, roles: ['admin'] }, 'Bearer test')).success, false); assert.equal((await service.executeApiCall({ method: 'GET', path: '/hr/example/:id', pathParams: { id: '..' } }, actor, 'Bearer test')).success, false); assert.equal(calls.length, 0); });

it('本人身份和自助请假无需员工管理权限，目录包含用途、枚举和参数位置', () => {
    const modules = new Map([['business', { controllers: new Map([
        ['employee', { metatype: EmployeeController }], ['leave', { metatype: LeaveController }],
    ]) }]]);
    const service = new AgentApiGateway(modules as any, new Reflector(), { get: () => undefined } as any);
    const user = { ...actor, permissions: ['hr:leave:add'] };
    const endpoints = service.getAuthorizedEndpoints(user);
    assert.ok(endpoints.some(ep => ep.path === '/hr/employee/me'));
    assert.ok(endpoints.some(ep => ep.path === '/hr/leave/my/apply'));
    assert.equal(endpoints.some(ep => ep.path === '/hr/leave/apply'), false);
    assert.equal(endpoints.some(ep => ep.path === '/hr/employee/list'), false);
    const self = endpoints.find(ep => ep.path === '/hr/leave/my/apply');
    assert.match(self.dtoFieldsSummary, /body:.*startDate\*/);
    assert.match(self.dtoFieldsSummary, /enum=\["ANNUAL","SICK","CASUAL"\]/);
    assert.doesNotMatch(self.dtoFieldsSummary, /empId|days/);
    const prompt = service.buildAuthorizedApiPrompt(user);
    assert.match(prompt, /purpose\? enum=\["leave","attendance","performance","user","employee"\]/);
    assert.match(prompt, /query:/);
    assert.match(prompt, /不能用于推断当前登录人身份/);
    assert.match(prompt, /未绑定/);
    const noPermissions = service.getAuthorizedEndpoints({ ...actor, permissions: [] });
    assert.equal(noPermissions.some(ep => ep.path === '/hr/leave/my/apply'), false);
});
