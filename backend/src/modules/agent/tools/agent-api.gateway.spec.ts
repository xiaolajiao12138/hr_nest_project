import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OperLog } from '../../../common/decorators/oper-log.decorator';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { AgentApiGateway } from './agent-api.gateway';

class MockCreateTrainDto {
  @IsNotEmpty({ message: '培训主题不能为空' })
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  speaker?: string;
}

@Controller('hr/training')
class MockTrainingController {
  @Post()
  @Permissions('hr:training:add')
  @OperLog({ title: '新增培训计划', businessType: 'INSERT' })
  create(@Body() dto: MockCreateTrainDto) {
    return dto;
  }

  @Delete(':id')
  @Permissions('hr:training:delete')
  @OperLog({ title: '删除培训计划', businessType: 'DELETE' })
  remove(@Param('id') id: number) {
    return id;
  }

  @Get('export/excel')
  @Permissions('hr:training:export')
  exportExcel() {
    return null;
  }
}

@Controller('agent')
class MockSelfAgentController {
  @Post('chat')
  chat() {
    return null;
  }
}

function createGateway(fetcher?: typeof fetch) {
  const controllersMap = new Map<string, any>([
    [
      'MockTrainingController',
      {
        metatype: MockTrainingController,
        instance: new MockTrainingController(),
      },
    ],
    [
      'MockSelfAgentController',
      {
        metatype: MockSelfAgentController,
        instance: new MockSelfAgentController(),
      },
    ],
  ]);

  const mockModulesContainer: any = new Map([
    ['TestModule', { controllers: controllersMap }],
  ]);

  const mockConfigService: any = {
    get: (key: string) => {
      if (key === 'port') return 3000;
      if (key === 'apiPrefix') return '/api';
      return undefined;
    },
  };

  return new AgentApiGateway(
    mockModulesContainer,
    new Reflector(),
    mockConfigService,
    fetcher,
  );
}

const adminUser: CurrentUserPayload = {
  userId: 1,
  username: 'admin',
  roles: ['admin'],
  permissions: ['*'],
};

const limitedUser: CurrentUserPayload = {
  userId: 2,
  username: 'staff',
  roles: ['employee'],
  permissions: ['hr:training:add'], // 仅有新增权限，无删除权限
};

describe('AgentApiGateway 自动路由发现与内部业务网关', () => {
  it('自动扫描业务控制器路由、权限与 DTO 字段元数据，并自动排除 agent 自身与二进制导出接口', () => {
    const gateway = createGateway();
    const adminEndpoints = gateway.getAuthorizedEndpoints(adminUser);

    assert.equal(adminEndpoints.length, 2);
    const postEp = adminEndpoints.find((e) => e.method === 'POST');
    assert.ok(postEp);
    assert.equal(postEp.path, '/hr/training');
    assert.equal(postEp.title, '新增培训计划');
    assert.match(postEp.dtoFieldsSummary, /title\*/);
    assert.match(postEp.dtoFieldsSummary, /speaker\?/);

    // 受限员工只能看到已授权的 POST 接口，看不到无权限的 DELETE 接口
    const staffEndpoints = gateway.getAuthorizedEndpoints(limitedUser);
    assert.equal(staffEndpoints.length, 1);
    assert.equal(staffEndpoints[0].method, 'POST');
  });

  it('拦截未授权用户越权调用受控路由', async () => {
    const gateway = createGateway();
    const res = await gateway.executeApiCall(
      {
        method: 'DELETE',
        path: '/hr/training/:id',
        pathParams: { id: 10 },
        confirmed: true,
      },
      limitedUser,
      'Bearer test-token',
    );

    assert.equal(res.success, false);
    assert.match(res.resultSummary, /权限不足/);
  });

  it('对 DELETE 破坏性接口在未确认时自动挂起并返回人机协同二次确认卡片载荷', async () => {
    let fetchCalled = false;
    const gateway = createGateway((async () => {
      fetchCalled = true;
      return new Response('{}');
    }) as any);

    const res = await gateway.executeApiCall(
      {
        method: 'DELETE',
        path: '/hr/training/:id',
        pathParams: { id: 88 },
        targetName: '新员工入职安全培训',
        confirmed: false,
      },
      adminUser,
      'Bearer admin-token',
    );

    assert.equal(fetchCalled, false);
    assert.equal(res.success, true);
    assert.equal(res.data.requireConfirmation, true);
    assert.equal(res.data.targetId, 88);
    assert.equal(res.data.targetName, '新员工入职安全培训');
  });

  it('确认后携带用户真实 Authorization 头向本机内部路由发起调用并解包响应', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const gateway = createGateway((async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({ code: 200, msg: 'success', data: { id: 101, title: 'AI赋能实战' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any);

    const res = await gateway.executeApiCall(
      {
        method: 'POST',
        path: '/hr/training',
        body: { title: 'AI赋能实战' },
      },
      limitedUser,
      'Bearer staff-jwt-token',
    );

    assert.equal(res.success, true);
    assert.equal(capturedUrl, 'http://127.0.0.1:3000/api/hr/training');
    assert.equal((capturedInit?.headers as any)?.Authorization, 'Bearer staff-jwt-token');
    assert.equal(res.data.id, 101);
  });
});
