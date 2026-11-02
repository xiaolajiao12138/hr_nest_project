import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentService } from './agent.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AgentStreamEvent } from './dto/agent.dto';

const adminUser: CurrentUserPayload = {
  userId: 1,
  username: 'admin',
  roles: ['admin'],
  permissions: ['*'],
  deptId: 10,
};

const staffUser: CurrentUserPayload = {
  userId: 5,
  username: 'EMP005',
  roles: ['employee'],
  permissions: ['hr:leave:add'],
  deptId: 20,
};

function createTestDeps() {
  const queryCalls: Array<{ sql: string; user: CurrentUserPayload; purpose?: string }> = [];
  const apiCalls: Array<{ input: any; user: CurrentUserPayload; authHeader: string }> = [];

  const mockConfigService: any = {
    get: (key: string) => {
      if (key === 'llm') {
        return {
          apiKey: 'test-key',
          baseUrl: 'http://127.0.0.1:9999/v1',
          model: 'test-hr-model',
        };
      }
      return undefined;
    },
  };

  const mockSchemaInspector: any = {
    resolveCurrentEmployeeId: async (user: CurrentUserPayload) =>
      user.username === 'EMP005' ? 105 : 1,
    buildAuthorizedSchemaPrompt: () =>
      '- hr_employee: [id(主键), emp_no(工号), name(姓名)]',
    executeReadOnlyQuery: async (
      sql: string,
      user: CurrentUserPayload,
      purpose?: string,
    ) => {
      queryCalls.push({ sql, user, purpose });
      return {
        success: true,
        title: purpose ? `数据查询：${purpose}` : '系统数据只读查询',
        resultSummary: '查询成功，返回 2 条记录',
        data: {
          count: 2,
          rows: [
            { id: 1, emp_no: 'EMP001', name: '张三' },
            { id: 2, emp_no: 'EMP002', name: '李四' },
          ],
        },
      };
    },
  };

  const mockApiGateway: any = {
    getAuthorizedEndpoints: (user: CurrentUserPayload) => {
      if (user.roles?.includes('admin')) {
        return [
          {
            method: 'POST',
            path: '/hr/employee',
            title: '新增员工档案',
            requiredPermissions: ['hr:employee:add'],
            dtoFieldsSummary: 'empNo*, name*',
          },
          {
            method: 'DELETE',
            path: '/hr/employee/:id',
            title: '删除员工档案',
            requiredPermissions: ['hr:employee:delete'],
            dtoFieldsSummary: '',
          },
        ];
      }
      return [
        {
          method: 'POST',
          path: '/hr/leave',
          title: '提交请假申请',
          requiredPermissions: ['hr:leave:add'],
          dtoFieldsSummary: 'type*, startTime*, endTime*',
        },
      ];
    },
    buildAuthorizedApiPrompt: () =>
      '- POST /hr/employee [新增员工档案] | 参数: { empNo*, name* }\n- DELETE /hr/employee/:id [删除员工档案]',
    executeApiCall: async (
      input: any,
      user: CurrentUserPayload,
      authHeader: string,
    ) => {
      apiCalls.push({ input, user, authHeader });
      if (input.method === 'DELETE' && input.confirmed !== true) {
        return {
          success: true,
          title: '删除员工档案（待人工确认）',
          resultSummary: '已拦截高危删除操作【删除员工档案】，等待用户在聊天窗口点击确认按钮',
          data: {
            requireConfirmation: true,
            action: 'DELETE /hr/employee/9',
            targetId: 9,
            targetName: input.targetName || '王五',
            prompt: '即将执行高危操作【删除员工档案】对象：王五，删除后可能无法恢复，是否确认执行？',
          },
        };
      }
      return {
        success: true,
        title: '删除员工档案',
        resultSummary: '成功执行【删除员工档案】',
        data: { deleted: true },
      };
    },
  };

  return {
    mockConfigService,
    mockSchemaInspector,
    mockApiGateway,
    queryCalls,
    apiCalls,
  };
}

describe('AgentService 极简双通用引擎中枢测试', () => {
  it('chat 应仅向大模型暴露 query_system_data 与 call_business_api 两个通用工具，并正确调度只读查询', async () => {
    const { mockConfigService, mockSchemaInspector, mockApiGateway, queryCalls } =
      createTestDeps();

    const capturedParams: any[] = [];
    let callStep = 0;

    const fakeOpenAi: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedParams.push(params);
            callStep++;
            if (callStep === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'call_sql_1',
                          type: 'function',
                          function: {
                            name: 'query_system_data',
                            arguments: JSON.stringify({
                              sql: 'SELECT id, emp_no, name FROM hr_employee',
                              purpose: '查询在职员工名单',
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '共查询到 **2** 名在职员工：张三、李四。',
                  },
                },
              ],
            };
          },
        },
      },
    };

    const service = new AgentService(
      mockConfigService,
      mockSchemaInspector,
      mockApiGateway,
      fakeOpenAi,
    );

    const res = await service.chat(
      { message: '查一下公司有哪些员工' },
      adminUser,
      'Bearer admin-jwt-token',
    );

    // 验证只注册了 2 个通用引擎工具
    const registeredToolNames = capturedParams[0].tools.map(
      (t: any) => t.function.name,
    );
    assert.deepEqual(registeredToolNames, [
      'query_system_data',
      'call_business_api',
    ]);

    // 验证正确调度了只读 SQL 查询引擎
    assert.equal(queryCalls.length, 1);
    assert.equal(
      queryCalls[0].sql,
      'SELECT id, emp_no, name FROM hr_employee',
    );
    assert.equal(queryCalls[0].purpose, '查询在职员工名单');

    // 验证返回结构与前端契约一致
    assert.match(res.reply, /张三、李四/);
    assert.equal(res.executedTools.length, 1);
    assert.equal(res.executedTools[0].name, 'query_system_data');
    assert.equal(res.executedTools[0].title, '数据查询：查询在职员工名单');
    assert.equal(res.confirmationAction, undefined);
  });

  it('首轮删除请求即使模型误传 confirmed=true，也应强制降级拦截并返回 confirmationAction 卡片', async () => {
    const { mockConfigService, mockSchemaInspector, mockApiGateway, apiCalls } =
      createTestDeps();

    let callStep = 0;
    const fakeOpenAi: any = {
      chat: {
        completions: {
          create: async () => {
            callStep++;
            if (callStep === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'call_del_1',
                          type: 'function',
                          function: {
                            name: 'call_business_api',
                            arguments: JSON.stringify({
                              method: 'DELETE',
                              path: '/hr/employee/9',
                              targetName: '王五',
                              confirmed: true, // 模拟模型幻觉在首轮误传 true
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '已为您挂起删除操作，请点击下方确认按钮核准。',
                  },
                },
              ],
            };
          },
        },
      },
    };

    const service = new AgentService(
      mockConfigService,
      mockSchemaInspector,
      mockApiGateway,
      fakeOpenAi,
    );

    const res = await service.chat(
      { message: '帮我删除员工王五（ID: 9）' },
      adminUser,
      'Bearer admin-jwt-token',
    );

    assert.equal(apiCalls.length, 1);
    // 首轮无前序 assistant 确认上下文，confirmed 必须被强制置为 false
    assert.equal(apiCalls[0].input.confirmed, false);
    assert.equal(apiCalls[0].authHeader, 'Bearer admin-jwt-token');

    assert.ok(res.confirmationAction);
    assert.equal(res.confirmationAction?.targetId, 9);
    assert.equal(res.confirmationAction?.targetName, '王五');
  });

  it('chatStream 在多轮确认后应放行 confirmed=true 并按序推送 tool_start -> tool_end -> chunk -> done 事件', async () => {
    const { mockConfigService, mockSchemaInspector, mockApiGateway, apiCalls } =
      createTestDeps();

    let callStep = 0;
    const fakeOpenAi: any = {
      chat: {
        completions: {
          create: async () => {
            callStep++;
            if (callStep === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'call_del_confirm',
                          type: 'function',
                          function: {
                            name: 'call_business_api',
                            arguments: JSON.stringify({
                              method: 'DELETE',
                              path: '/hr/employee/9',
                              targetName: '王五',
                              confirmed: true,
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '员工【王五】档案已成功彻底删除。',
                  },
                },
              ],
            };
          },
        },
      },
    };

    const service = new AgentService(
      mockConfigService,
      mockSchemaInspector,
      mockApiGateway,
      fakeOpenAi,
    );

    const events: AgentStreamEvent[] = [];
    await service.chatStream(
      {
        message: '确认执行彻底删除员工【王五】（工号: 9），请立即执行物理删除。',
        history: [
          { role: 'user', content: '删除王五' },
          { role: 'assistant', content: '请点击下方确认按钮核准删除王五。' },
        ],
      },
      adminUser,
      (ev) => events.push(ev),
      'Bearer stream-jwt-token',
    );

    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].input.confirmed, true);
    assert.equal(apiCalls[0].authHeader, 'Bearer stream-jwt-token');

    const eventTypes = events.map((e) => e.type);
    assert.equal(eventTypes[0], 'tool_start');
    assert.equal(eventTypes[1], 'tool_end');
    assert.ok(eventTypes.includes('chunk'));
    assert.equal(eventTypes[eventTypes.length - 1], 'done');

    const streamedReply = events
      .filter((e) => e.type === 'chunk')
      .map((e) => e.content)
      .join('');
    assert.equal(streamedReply, '员工【王五】档案已成功彻底删除。');
  });

  it('getCapabilities 应基于动态发现的授权接口返回能力列表与对应角色引导词', () => {
    const { mockConfigService, mockSchemaInspector, mockApiGateway } =
      createTestDeps();
    const service = new AgentService(
      mockConfigService,
      mockSchemaInspector,
      mockApiGateway,
      {} as any,
    );

    const staffCap = service.getCapabilities(staffUser);
    assert.equal(staffCap.username, 'EMP005');
    assert.equal(staffCap.isAdmin, false);
    assert.deepEqual(staffCap.allowedTools, [
      'query_system_data',
      'POST /hr/leave',
    ]);
    assert.ok(staffCap.promptSuggestions.length > 0);
  });
});
