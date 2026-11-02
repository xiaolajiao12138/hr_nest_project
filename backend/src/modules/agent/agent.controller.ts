import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { AgentChatDto } from './dto/agent.dto';
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
 * 2. 挂载 JwtAuthGuard 鉴权，并将当前用户身份及 Authorization 令牌透传至双引擎中枢。
 */
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * 智能体自然语言对话接口（标准 JSON 模式）
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
   * 智能体自然语言对话接口（SSE 实时流式推送模式）
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
