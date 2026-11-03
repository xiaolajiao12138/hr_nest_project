import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentSessionService } from './agent-session.service';
import { AgentService } from './agent.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AgentStreamEvent } from './dto/agent.dto';

/**
 * 内存模拟仓储，用于验证会话与消息的真实持久化状态流转与用户隔离边界
 */
function createInMemoryRepos() {
  let sessionSeq = 1;
  let msgSeq = 1;
  const sessions: any[] = [];
  const messages: any[] = [];

  const sessionRepo: any = {
    sessions,
    create: (partial: any) => ({ ...partial }),
    save: async (entity: any) => {
      if (!entity.id) {
        entity.id = sessionSeq++;
        entity.createdAt = new Date();
        entity.updatedAt = new Date();
        entity.lastMessageAt = entity.lastMessageAt || new Date();
        sessions.push(entity);
      } else {
        entity.updatedAt = new Date();
        const idx = sessions.findIndex((s) => s.id === entity.id);
        if (idx >= 0) sessions[idx] = entity;
      }
      return { ...entity };
    },
    findOne: async ({ where }: any) => {
      const found = sessions.find(
        (s) =>
          (where.id === undefined || s.id === where.id) &&
          (where.userId === undefined || s.userId === where.userId),
      );
      return found ? { ...found } : null;
    },
    createQueryBuilder: () => {
      let targetUserId: number | undefined;
      let kw: string | undefined;
      const qb: any = {
        where: (_sql: string, params: any) => {
          targetUserId = params.userId;
          return qb;
        },
        andWhere: (_sql: string, params: any) => {
          kw = String(params.kw || '').replace(/%/g, '');
          return qb;
        },
        orderBy: () => qb,
        addOrderBy: () => qb,
        take: () => qb,
        getMany: async () => {
          return sessions
            .filter(
              (s) =>
                s.userId === targetUserId &&
                (!kw || String(s.title).includes(kw)),
            )
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() -
                  new Date(a.lastMessageAt).getTime() || b.id - a.id,
            );
        },
      };
      return qb;
    },
    delete: async (criteria: any) => {
      const idx = sessions.findIndex(
        (s) => s.id === criteria.id && s.userId === criteria.userId,
      );
      if (idx >= 0) sessions.splice(idx, 1);
      return { affected: idx >= 0 ? 1 : 0 };
    },
  };

  const messageRepo: any = {
    messages,
    create: (partial: any) => ({ ...partial }),
    save: async (entity: any) => {
      if (!entity.id) {
        entity.id = msgSeq++;
        entity.createdAt = new Date();
        entity.updatedAt = new Date();
        entity.isConfirmationHandled = Boolean(entity.isConfirmationHandled);
        messages.push(entity);
      } else {
        entity.updatedAt = new Date();
        const idx = messages.findIndex((m) => m.id === entity.id);
        if (idx >= 0) messages[idx] = entity;
      }
      return { ...entity };
    },
    find: async ({ where, order, take }: any) => {
      let list = messages.filter(
        (m) =>
          (where.sessionId === undefined || m.sessionId === where.sessionId) &&
          (where.userId === undefined || m.userId === where.userId),
      );
      if (order?.id === 'DESC') {
        list = [...list].sort((a, b) => b.id - a.id);
      } else {
        list = [...list].sort((a, b) => a.id - b.id);
      }
      if (take) {
        list = list.slice(0, take);
      }
      return list.map((m) => ({ ...m }));
    },
    findOne: async ({ where, order }: any) => {
      let list = messages.filter(
        (m) =>
          (where.sessionId === undefined || m.sessionId === where.sessionId) &&
          (where.userId === undefined || m.userId === where.userId) &&
          (where.role === undefined || m.role === where.role) &&
          (where.isConfirmationHandled === undefined ||
            m.isConfirmationHandled === where.isConfirmationHandled),
      );
      if (order?.id === 'DESC') {
        list = [...list].sort((a, b) => b.id - a.id);
      }
      return list[0] ? { ...list[0] } : null;
    },
    delete: async (criteria: any) => {
      let count = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (
          messages[i].sessionId === criteria.sessionId &&
          (criteria.userId === undefined || messages[i].userId === criteria.userId)
        ) {
          messages.splice(i, 1);
          count++;
        }
      }
      return { affected: count };
    },
  };

  const mockDataSource: any = {
    transaction: async (cb: (manager: any) => Promise<any>) => {
      const manager = {
        delete: async (EntityOrName: any, criteria: any) => {
          const name =
            typeof EntityOrName === 'string'
              ? EntityOrName
              : EntityOrName?.name || '';
          if (name.includes('Message')) {
            return messageRepo.delete(criteria);
          }
          return sessionRepo.delete(criteria);
        },
      };
      return cb(manager);
    },
  };

  return { sessionRepo, messageRepo, mockDataSource };
}

describe('AgentSessionService 企业级会话数据库持久化与隔离测试', () => {
  it('首次发消息未指定 sessionId 时自动创建会话并提取首句作为标题，严格隔离不同用户会话', async () => {
    const { sessionRepo, messageRepo, mockDataSource } = createInMemoryRepos();
    const sessionService = new AgentSessionService(
      sessionRepo,
      messageRepo,
      mockDataSource,
    );

    const { session, isNew } = await sessionService.ensureSessionForChat(
      10,
      '帮我查询一下研发中心今年10月的考勤汇总报表，谢谢！',
    );

    assert.equal(isNew, true);
    assert.equal(session.userId, 10);
    assert.ok(session.title.length > 0 && session.title.length <= 30);
    assert.match(session.title, /研发中心/);

    // 用户 20 查询自己的会话列表应为空，绝不能看到用户 10 的会话
    const user20Sessions = await sessionService.listUserSessions(20);
    assert.equal(user20Sessions.length, 0);

    // 用户 20 试图越权读取、重命名或删除用户 10 的会话均被阻断
    await assert.rejects(
      () => sessionService.getSessionMessages(session.id, 20),
      (err: any) => err instanceof BusinessException,
    );
    await assert.rejects(
      () => sessionService.renameSession(session.id, 20, '篡改标题'),
      (err: any) => err instanceof BusinessException,
    );
    await assert.rejects(
      () => sessionService.deleteSession(session.id, 20),
      (err: any) => err instanceof BusinessException,
    );
  });

  it('持久化消息流时应保存工具摘要与二次确认卡片，并在用户回复下一条消息时自动闭合未处理的确认状态', async () => {
    const { sessionRepo, messageRepo, mockDataSource } = createInMemoryRepos();
    const sessionService = new AgentSessionService(
      sessionRepo,
      messageRepo,
      mockDataSource,
    );

    const s = await sessionService.createSession(10, '新对话');
    // 空会话首次发消息应自动将默认的“新对话”更新为语义标题
    const ensured = await sessionService.ensureSessionForChat(
      10,
      '删除员工王五的测试档案',
      s.id,
    );
    assert.match(ensured.session.title, /删除员工王五/);

    await sessionService.appendUserMessage(s.id, 10, '删除员工王五的测试档案');
    await sessionService.appendAssistantMessage(s.id, 10, {
      content: '请确认是否删除【王五】。',
      executedTools: [
        {
          name: 'call_business_api',
          title: '删除员工档案（待人工确认）',
          success: true,
          resultSummary: '等待确认',
        },
      ],
      confirmationAction: {
        action: 'DELETE /hr/employee/9',
        targetId: 9,
        targetName: '王五',
        prompt: '确认删除王五？',
      },
    });

    let detail = await sessionService.getSessionMessages(s.id, 10);
    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[1].isConfirmationHandled, false);
    assert.equal(detail.messages[1].confirmationAction?.targetName, '王五');

    // 用户发出确认消息后，上一条 assistant 的 isConfirmationHandled 应自动落库更新为 true
    await sessionService.appendUserMessage(
      s.id,
      10,
      '确认执行彻底删除【王五】（ID: 9）',
    );
    detail = await sessionService.getSessionMessages(s.id, 10);
    assert.equal(detail.messages[1].isConfirmationHandled, true);

    // 删除会话应级联清理消息
    await sessionService.deleteSession(s.id, 10);
    assert.equal(sessionRepo.sessions.length, 0);
    assert.equal(messageRepo.messages.length, 0);
  });

  it('AgentService.chatStream 接入会话服务后应自动创建会话、推送 session 事件并落库完整问答记录', async () => {
    const { sessionRepo, messageRepo, mockDataSource } = createInMemoryRepos();
    const sessionService = new AgentSessionService(
      sessionRepo,
      messageRepo,
      mockDataSource,
    );

    const mockConfigService: any = {
      get: () => ({
        apiKey: 'test-key',
        baseUrl: 'http://127.0.0.1:9999/v1',
        model: 'test-model',
      }),
    };
    const mockSchemaInspector: any = {
      resolveCurrentEmployeeId: async () => 101,
    };
    const mockApiGateway: any = {
      getAuthorizedEndpoints: () => [
        {
          method: 'GET',
          path: '/hr/leave/list',
          title: '查询请假记录',
          requiredPermissions: [],
          dtoFieldsSummary: '',
        },
      ],
      buildAuthorizedApiPrompt: () => '- GET /hr/leave/list [查询请假记录]',
    };
    const fakeOpenAi: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '您本月暂无请假记录。',
                },
              },
            ],
          }),
        },
      },
    };

    const agentService = new AgentService(
      mockConfigService,
      mockSchemaInspector,
      mockApiGateway,
      fakeOpenAi,
      sessionService,
    );

    const user: CurrentUserPayload = {
      userId: 7,
      username: 'zhangsan',
      roles: ['employee'],
      permissions: ['hr:leave:add'],
    };

    const events: AgentStreamEvent[] = [];
    await agentService.chatStream(
      { message: '查询我本月的请假记录' },
      user,
      (ev) => events.push(ev),
      'Bearer token',
    );

    // 首帧应推送 session 事件返回新创建的 sessionId 和标题
    const sessionEv = events.find((e) => e.type === 'session');
    assert.ok(sessionEv, '应推送 session 事件通知前端绑定新会话 ID');
    assert.ok(sessionEv?.sessionId);
    assert.match(sessionEv?.sessionTitle || '', /查询我本月的请假记录/);

    // 数据库中应已完整持久化 1 条 user 消息 + 1 条 assistant 消息
    const saved = await sessionService.getSessionMessages(
      sessionEv!.sessionId!,
      7,
    );
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[0].role, 'user');
    assert.equal(saved.messages[0].content, '查询我本月的请假记录');
    assert.equal(saved.messages[1].role, 'assistant');
    assert.equal(saved.messages[1].content, '您本月暂无请假记录。');
  });
});
