import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentService } from './agent.service';
import { AgentSessionService } from './agent-session.service';
import {
  AgentChatDto,
  CreateAgentSessionDto,
  RenameAgentSessionDto,
} from './dto/agent.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { OperLog } from '../../common/decorators/oper-log.decorator';

/**
 * 人事数字化智能体 (HR AI Agent) 核心控制器
 *
 * 核心职责：
 * 1. 提供标准 JSON 对话接口、SSE 实时流式对话接口与用户个性化能力查询接口；
 * 2. 提供企业级多会话持久化管理接口（会话列表、新建会话、历史消息加载、重命名、删除、清空）；
 * 3. 严格按当前登录用户 currentUser.userId 隔离会话归属。
 */
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly sessionService: AgentSessionService,
  ) {}

  // ==================== 会话持久化管理接口 ====================

  /**
   * 获取当前登录用户的历史会话列表（按最近活跃时间倒序）
   */
  @Get('sessions')
  async listSessions(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query('keyword') keyword?: string,
  ) {
    return this.sessionService.listUserSessions(currentUser.userId, keyword);
  }

  /**
   * 显式创建一个新空白会话
   */
  @Post('sessions')
  async createSession(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: CreateAgentSessionDto,
  ) {
    return this.sessionService.createSession(currentUser.userId, dto?.title);
  }

  /**
   * 获取指定会话下的完整历史消息列表
   */
  @Get('sessions/:id/messages')
  async getSessionMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.sessionService.getSessionMessages(id, currentUser.userId);
  }

  /**
   * 重命名指定会话标题（支持 PATCH）
   */
  @Patch('sessions/:id')
  async patchRenameSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameAgentSessionDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.sessionService.renameSession(id, currentUser.userId, dto.title);
  }

  /**
   * 重命名指定会话标题（兼容 PUT）
   */
  @Put('sessions/:id')
  async putRenameSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameAgentSessionDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.sessionService.renameSession(id, currentUser.userId, dto.title);
  }

  /**
   * 删除指定会话及其全部关联消息
   */
  @Delete('sessions/:id')
  async deleteSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.sessionService.deleteSession(id, currentUser.userId);
  }

  /**
   * 清空指定会话下的消息记录
   */
  @Delete('sessions/:id/messages')
  async clearSessionMessages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.sessionService.clearSessionMessages(id, currentUser.userId);
  }

  // ==================== 智能体对话与能力接口 ====================

  /**
   * 智能体自然语言对话接口（标准 JSON 模式，自动持久化会话与消息）
   */
  @Post('chat')
  @OperLog({ title: 'AI智能体对话交互', businessType: 'OTHER' })
  async chat(
    @Body() chatDto: AgentChatDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.agentService.chat(chatDto, currentUser, authHeader || '');
  }

  /**
   * 智能体自然语言对话接口（SSE 实时流式推送模式，自动持久化会话与消息）
   */
  @Post('chat-stream')
  @OperLog({ title: 'AI智能体流式对话交互', businessType: 'OTHER' })
  async chatStream(
    @Body() chatDto: AgentChatDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Headers('authorization') authHeader: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      await this.agentService.chatStream(
        chatDto,
        currentUser,
        (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        authHeader || '',
      );
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: err.message || '内部处理错误' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * 获取当前登录用户的 AI 助手权限能力列表与快捷指令推荐
   */
  @Get('capabilities')
  async getCapabilities(@CurrentUser() currentUser: CurrentUserPayload) {
    return this.agentService.getCapabilities(currentUser);
  }
}
