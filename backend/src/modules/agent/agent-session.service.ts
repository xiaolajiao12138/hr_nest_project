import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AgentSession } from './entities/agent-session.entity';
import { AgentMessage } from './entities/agent-message.entity';
import {
  AgentChatMessageDto,
  AgentExecutedToolInfo,
  ConfirmationActionInfo,
} from './dto/agent.dto';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * AI 智能体会话与消息持久化管理服务
 *
 * 核心职责：
 * 1. 按当前登录用户 userId 严格隔离所有会话与历史消息，杜绝任何跨账号访问；
 * 2. 支持新建会话、首句自动生成语义标题、重命名会话、事务级联删除会话与清空消息；
 * 3. 为多轮对话引擎提供数据库权威上下文加载与问答轨迹（含工具微标、二次确认状态）持久化；
 * 4. 启动时幂等自愈创建表结构与索引，兼容生产环境 synchronize=false 场景。
 */
@Injectable()
export class AgentSessionService implements OnModuleInit {
  private readonly logger = new Logger(AgentSessionService.name);

  constructor(
    @InjectRepository(AgentSession)
    private readonly sessionRepo: Repository<AgentSession>,
    @InjectRepository(AgentMessage)
    private readonly messageRepo: Repository<AgentMessage>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS sys_agent_session (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title VARCHAR(120) NOT NULL DEFAULT '新对话',
          last_message_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_agent_session_user_id ON sys_agent_session (user_id);
        CREATE INDEX IF NOT EXISTS idx_agent_session_last_msg_at ON sys_agent_session (last_message_at DESC);

        CREATE TABLE IF NOT EXISTS sys_agent_message (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          executed_tools JSONB,
          confirmation_action JSONB,
          is_confirmation_handled BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_agent_msg_session_id ON sys_agent_message (session_id);
        CREATE INDEX IF NOT EXISTS idx_agent_msg_user_id ON sys_agent_message (user_id);
      `);
    } catch (err: any) {
      this.logger.warn(`AI 会话持久化表自愈检查提示: ${err?.message || err}`);
    }
  }

  /**
   * 从用户首条消息中智能提取简洁可读的会话标题
   */
  generateSmartTitle(rawMessage: string): string {
    const cleaned = (rawMessage || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) {
      return '新对话';
    }
    return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
  }

  /**
   * 校验会话归属权，非本人会话一律抛出业务异常阻断
   */
  async assertOwnedSession(
    sessionId: number,
    userId: number,
  ): Promise<AgentSession> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new BusinessException('该对话会话不存在或无权访问');
    }
    return session;
  }

  /**
   * 获取当前用户的历史会话列表（按最新活跃时间倒序）
   */
  async listUserSessions(
    userId: number,
    keyword?: string,
  ): Promise<AgentSession[]> {
    const qb = this.sessionRepo
      .createQueryBuilder('session')
      .where('session.userId = :userId', { userId });

    const trimmedKw = keyword?.trim();
    if (trimmedKw) {
      qb.andWhere('session.title LIKE :kw', { kw: `%${trimmedKw}%` });
    }

    return qb
      .orderBy('session.lastMessageAt', 'DESC')
      .addOrderBy('session.id', 'DESC')
      .take(100)
      .getMany();
  }

  /**
   * 显式创建一个新空白会话
   */
  async createSession(userId: number, title?: string): Promise<AgentSession> {
    const safeTitle = (title || '').trim().slice(0, 100) || '新对话';
    const session = this.sessionRepo.create({
      userId,
      title: safeTitle,
      lastMessageAt: new Date(),
    });
    return this.sessionRepo.save(session);
  }

  /**
   * 重命名本人名下的指定会话标题
   */
  async renameSession(
    sessionId: number,
    userId: number,
    title: string,
  ): Promise<AgentSession> {
    const session = await this.assertOwnedSession(sessionId, userId);
    const trimmed = (title || '').trim().slice(0, 100);
    if (!trimmed) {
      throw new BusinessException('会话标题不能为空');
    }
    session.title = trimmed;
    return this.sessionRepo.save(session);
  }

  /**
   * 事务内删除指定会话及其关联的全部历史消息
   */
  async deleteSession(
    sessionId: number,
    userId: number,
  ): Promise<{ deleted: boolean }> {
    await this.assertOwnedSession(sessionId, userId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(AgentMessage, { sessionId, userId });
      await manager.delete(AgentSession, { id: sessionId, userId });
    });

    return { deleted: true };
  }

  /**
   * 清空指定会话下的全部消息记录（保留会话本身）
   */
  async clearSessionMessages(
    sessionId: number,
    userId: number,
  ): Promise<{ cleared: boolean }> {
    await this.assertOwnedSession(sessionId, userId);
    await this.messageRepo.delete({ sessionId, userId });
    return { cleared: true };
  }

  /**
   * 获取指定会话的元数据与完整历史消息流（按时间升序）
   */
  async getSessionMessages(
    sessionId: number,
    userId: number,
  ): Promise<{ session: AgentSession; messages: AgentMessage[] }> {
    const session = await this.assertOwnedSession(sessionId, userId);
    const messages = await this.messageRepo.find({
      where: { sessionId, userId },
      order: { id: 'ASC' },
    });
    return { session, messages };
  }

  /**
   * 确保对话绑定有效会话：
   * - 未传 sessionId 时自动新建会话并用首条消息生成标题；
   * - 已传 sessionId 且该会话尚无消息、标题仍为默认“新对话”时，自动更新为语义标题。
   */
  async ensureSessionForChat(
    userId: number,
    firstMessage: string,
    sessionId?: number,
  ): Promise<{ session: AgentSession; isNew: boolean }> {
    if (!sessionId) {
      const created = this.sessionRepo.create({
        userId,
        title: this.generateSmartTitle(firstMessage),
        lastMessageAt: new Date(),
      });
      const saved = await this.sessionRepo.save(created);
      return { session: saved, isNew: true };
    }

    const session = await this.assertOwnedSession(sessionId, userId);
    if (session.title === '新对话') {
      const existingMsg = await this.messageRepo.findOne({
        where: { sessionId, userId },
        order: { id: 'ASC' },
      });
      if (!existingMsg) {
        session.title = this.generateSmartTitle(firstMessage);
        const updated = await this.sessionRepo.save(session);
        return { session: updated, isNew: false };
      }
    }

    return { session, isNew: false };
  }

  /**
   * 从数据库提取指定会话最近的若干条历史消息用于构建大模型多轮上下文
   */
  async getRecentContextMessages(
    sessionId: number,
    userId: number,
    limit = 8,
  ): Promise<AgentChatMessageDto[]> {
    const recentDesc = await this.messageRepo.find({
      where: { sessionId, userId },
      order: { id: 'DESC' },
      take: limit,
    });

    return recentDesc
      .reverse()
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
  }

  /**
   * 追加持久化一条用户提问消息，并自动将前序未处理的二次确认卡片置为已响应
   */
  async appendUserMessage(
    sessionId: number,
    userId: number,
    content: string,
  ): Promise<AgentMessage> {
    const session = await this.assertOwnedSession(sessionId, userId);

    // 若前序最后一条 AI 消息带有尚未处理的二次确认卡片，用户发新消息响应后自动标记已处理
    const lastPendingAssistant = await this.messageRepo.findOne({
      where: {
        sessionId,
        userId,
        role: 'assistant',
        isConfirmationHandled: false,
      },
      order: { id: 'DESC' },
    });
    if (lastPendingAssistant && lastPendingAssistant.confirmationAction) {
      lastPendingAssistant.isConfirmationHandled = true;
      await this.messageRepo.save(lastPendingAssistant);
    }

    const msg = this.messageRepo.create({
      sessionId,
      userId,
      role: 'user',
      content,
      executedTools: null,
      confirmationAction: null,
      isConfirmationHandled: false,
    });
    const saved = await this.messageRepo.save(msg);

    session.lastMessageAt = new Date();
    await this.sessionRepo.save(session);

    return saved;
  }

  /**
   * 追加持久化一条 AI 助手回复消息（含工具执行轨迹与二次确认卡片载荷）
   */
  async appendAssistantMessage(
    sessionId: number,
    userId: number,
    payload: {
      content: string;
      executedTools?: AgentExecutedToolInfo[];
      confirmationAction?: ConfirmationActionInfo;
    },
  ): Promise<AgentMessage> {
    const session = await this.assertOwnedSession(sessionId, userId);

    const msg = this.messageRepo.create({
      sessionId,
      userId,
      role: 'assistant',
      content: payload.content || '',
      executedTools:
        payload.executedTools && payload.executedTools.length > 0
          ? payload.executedTools
          : null,
      confirmationAction: payload.confirmationAction || null,
      isConfirmationHandled: false,
    });
    const saved = await this.messageRepo.save(msg);

    session.lastMessageAt = new Date();
    await this.sessionRepo.save(session);

    return saved;
  }
}
