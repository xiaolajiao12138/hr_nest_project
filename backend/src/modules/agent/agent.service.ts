import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AgentChatDto,
  AgentChatMessageDto,
  AgentChatResponse,
  AgentExecutedToolInfo,
  AgentCapabilityInfo,
  AgentStreamEvent,
  ConfirmationActionInfo,
} from './dto/agent.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  AgentSchemaInspector,
  AgentToolResult,
} from './tools/agent-schema.inspector';
import { AgentApiGateway } from './tools/agent-api.gateway';
import { AgentSessionService } from './agent-session.service';

/**
 * 通用工具 1：全系统安全只读 SQL 查询引擎
 */

/**
 * 通用工具 2：全系统内部业务 API 网关（增删改审等业务动作）
 */
const CALL_BUSINESS_API_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'call_business_api',
    description:
      '调用系统已授权的内部业务接口执行新增、修改、审批、打卡或删除等操作。请严格从系统提示词【已授权业务接口目录】中选择 method、path 及 DTO 参数。',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['POST', 'PUT', 'DELETE', 'PATCH', 'GET'],
          description: 'HTTP 请求方法',
        },
        path: {
          type: 'string',
          description:
            '接口路径（如 /hr/leave 或 /hr/employee/9，不含 /api 前缀）',
        },
        pathParams: {
          type: 'object',
          description: '路径占位参数键值对象（如 { "id": 9 }）',
        },
        query: {
          type: 'object',
          description: 'URL 查询字符串参数对象',
        },
        body: {
          type: 'object',
          description: 'JSON 请求体对象，字段名须严格匹配接口目录中的参数说明',
        },
        targetName: {
          type: 'string',
          description: '执行删除等高危操作时的目标可读名称（用于展示确认卡片，如“王五”）',
        },
        confirmed: {
          type: 'boolean',
          description:
            '高危删除二次确认标志：首次发起删除时必须传 false 以弹出确认卡片；仅当用户在上一轮看到确认提示后明确回复确认删除时才可传 true',
        },
      },
      required: ['method', 'path'],
    },
  },
};

/**
 * 企业级极简智能体中枢服务（零业务表硬编码耦合）
 *
 * 核心设计：
 * 1. 读操作统一走 AgentSchemaInspector（TypeORM 元数据自动感知 + PostgreSQL 只读事务沙箱 + 表/行级 RBAC）；
 * 2. 写操作统一走 AgentApiGateway（Controller 路由与 DTO 自动发现 + DELETE 二次确认拦截 + Bearer Token 内部网关转发）；
 * 3. 新增任何业务模块、表或接口均自动被智能体感知，无需修改本模块一行代码。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly openaiClient: OpenAI;
  private readonly modelName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly schemaInspector: AgentSchemaInspector,
    private readonly apiGateway: AgentApiGateway,
    @Optional() @Inject('AGENT_OPENAI_CLIENT') customOpenAiClient?: OpenAI,
    @Optional() private readonly sessionService?: AgentSessionService,
  ) {
    const llmConf = this.configService.get('llm');
    const apiKey = llmConf?.apiKey || process.env.LLM_API_KEY || '';
    const baseURL =
      llmConf?.baseUrl ||
      process.env.LLM_BASE_URL ||
      'https://sub2api.starysp.top/v1';
    this.modelName = llmConf?.model || process.env.LLM_MODEL || 'gpt-6.1-sol';

    this.openaiClient =
      customOpenAiClient ||
      new OpenAI({
        apiKey,
        baseURL,
      });

    this.logger.log(
      `[AI Agent 极简双引擎初始化完成] 模型: ${this.modelName}, 网关: ${baseURL}`,
    );
  }

  /**
   * 标准 JSON 模式对话接口（支持服务端会话数据库持久化）
   */
  async chat(
    chatDto: AgentChatDto,
    currentUser: CurrentUserPayload,
    authHeader = '',
  ): Promise<AgentChatResponse> {
    const { message, history = [] } = chatDto;

    let activeSessionId: number | undefined;
    let activeSessionTitle: string | undefined;
    let effectiveHistory: AgentChatMessageDto[] = history;

    if (this.sessionService) {
      const { session } = await this.sessionService.ensureSessionForChat(
        currentUser.userId,
        message,
        chatDto.sessionId,
      );
      activeSessionId = session.id;
      activeSessionTitle = session.title;

      const dbHistory = await this.sessionService.getRecentContextMessages(
        session.id,
        currentUser.userId,
        8,
      );
      if (dbHistory.length > 0) {
        effectiveHistory = dbHistory;
      }

      await this.sessionService.appendUserMessage(
        session.id,
        currentUser.userId,
        message,
      );
    }

    const { messages, toolsPayload } = await this.prepareConversation(
      message,
      effectiveHistory,
      currentUser,
    );
    const allowDestructiveConfirm = this.hasExplicitUserConfirmation(
      message,
      effectiveHistory,
    );

    const executedTools: AgentExecutedToolInfo[] = [];
    let confirmationAction: ConfirmationActionInfo | undefined;
    let finalReply = '';

    for (let loop = 0; loop < 5; loop++) {
      const completion = await this.openaiClient.chat.completions.create({
        model: this.modelName,
        messages,
        tools: toolsPayload,
        tool_choice: 'auto',
        temperature: 0.2,
      });

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) {
        finalReply = '智能助手未能生成有效回复，请稍后重试。';
        break;
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;

          const fnName = toolCall.function.name;
          const parsedArgs = this.safeParseArgs(toolCall.function.arguments);
          const result = await this.dispatchGenericTool(
            fnName,
            parsedArgs,
            currentUser,
            authHeader,
            allowDestructiveConfirm,
          );

          executedTools.push({
            name: fnName,
            title: result.title,
            success: result.success,
            resultSummary: result.resultSummary,
          });

          if (result.data?.requireConfirmation) {
            confirmationAction = {
              action: result.data.action,
              targetId: result.data.targetId,
              targetName: result.data.targetName,
              prompt: result.data.prompt,
            };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      finalReply =
        responseMessage.content || '已完成您的业务指令，请核对上述结果。';
      break;
    }

    if (!finalReply && executedTools.length > 0) {
      finalReply = '操作已执行完毕，具体执行状态可参考上方工具处理摘要。';
    }

    if (this.sessionService && activeSessionId) {
      await this.sessionService.appendAssistantMessage(
        activeSessionId,
        currentUser.userId,
        {
          content: finalReply,
          executedTools,
          confirmationAction,
        },
      );
    }

    return {
      reply: finalReply,
      executedTools,
      confirmationAction,
      sessionId: activeSessionId,
      sessionTitle: activeSessionTitle,
    };
  }

  /**
   * SSE 实时流式对话接口（支持服务端会话数据库持久化与首帧会话同步）
   */
  async chatStream(
    chatDto: AgentChatDto,
    currentUser: CurrentUserPayload,
    onEvent: (event: AgentStreamEvent) => void,
    authHeader = '',
  ): Promise<void> {
    const { message, history = [] } = chatDto;

    let activeSessionId: number | undefined;
    let activeSessionTitle: string | undefined;
    let effectiveHistory: AgentChatMessageDto[] = history;

    if (this.sessionService) {
      const { session } = await this.sessionService.ensureSessionForChat(
        currentUser.userId,
        message,
        chatDto.sessionId,
      );
      activeSessionId = session.id;
      activeSessionTitle = session.title;

      const dbHistory = await this.sessionService.getRecentContextMessages(
        session.id,
        currentUser.userId,
        8,
      );
      if (dbHistory.length > 0) {
        effectiveHistory = dbHistory;
      }

      await this.sessionService.appendUserMessage(
        session.id,
        currentUser.userId,
        message,
      );

      onEvent({
        type: 'session',
        sessionId: activeSessionId,
        sessionTitle: activeSessionTitle,
      });
    }

    const { messages, toolsPayload } = await this.prepareConversation(
      message,
      effectiveHistory,
      currentUser,
    );
    const allowDestructiveConfirm = this.hasExplicitUserConfirmation(
      message,
      effectiveHistory,
    );

    const executedTools: AgentExecutedToolInfo[] = [];
    let confirmationAction: ConfirmationActionInfo | undefined;
    let finalReplyText = '';

    for (let loop = 0; loop < 5; loop++) {
      const completion = await this.openaiClient.chat.completions.create({
        model: this.modelName,
        messages,
        tools: toolsPayload,
        tool_choice: 'auto',
        temperature: 0.2,
      });

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) {
        const fallback = '智能助手未能生成有效回复，请稍后重试。';
        finalReplyText = fallback;
        onEvent({
          type: 'chunk',
          content: fallback,
        });
        break;
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;

          const fnName = toolCall.function.name;
          const parsedArgs = this.safeParseArgs(toolCall.function.arguments);
          const runningTitle = this.resolveRunningTitle(fnName, parsedArgs);

          onEvent({
            type: 'tool_start',
            toolName: fnName,
            toolTitle: runningTitle,
          });

          const result = await this.dispatchGenericTool(
            fnName,
            parsedArgs,
            currentUser,
            authHeader,
            allowDestructiveConfirm,
          );

          executedTools.push({
            name: fnName,
            title: result.title,
            success: result.success,
            resultSummary: result.resultSummary,
          });

          onEvent({
            type: 'tool_end',
            toolName: fnName,
            toolTitle: result.title,
            toolSummary: result.resultSummary,
          });

          if (result.data?.requireConfirmation) {
            confirmationAction = {
              action: result.data.action,
              targetId: result.data.targetId,
              targetName: result.data.targetName,
              prompt: result.data.prompt,
            };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      const textContent = responseMessage.content || '';
      finalReplyText = textContent;
      if (textContent) {
        const chunkSize = 12;
        for (let i = 0; i < textContent.length; i += chunkSize) {
          onEvent({
            type: 'chunk',
            content: textContent.slice(i, i + chunkSize),
          });
        }
      }
      break;
    }

    if (this.sessionService && activeSessionId) {
      await this.sessionService.appendAssistantMessage(
        activeSessionId,
        currentUser.userId,
        {
          content:
            finalReplyText ||
            (executedTools.length > 0
              ? '操作已执行完毕，具体执行状态可参考上方工具处理摘要。'
              : ''),
          executedTools,
          confirmationAction,
        },
      );
    }

    onEvent({
      type: 'done',
      sessionId: activeSessionId,
      sessionTitle: activeSessionTitle,
      executedTools,
      confirmationAction,
    });
  }

  /**
   * 动态获取当前用户的 AI 能力概况与快捷提问词
   */
  getCapabilities(currentUser: CurrentUserPayload): AgentCapabilityInfo {
    const isAdmin = Boolean(
      currentUser.roles?.includes('admin') ||
        currentUser.permissions?.includes('*'),
    );
    const authorizedEndpoints =
      this.apiGateway.getAuthorizedEndpoints(currentUser);
    const allowedTools = [
      ...authorizedEndpoints.map((ep) => `${ep.method} ${ep.path}`),
    ];

    const promptSuggestions = isAdmin
      ? [
          '查询公司有哪些在职员工，并按部门统计人数',
          '查看我的账号拥有哪些角色和菜单权限',
          '查看最近待审核的请假申请记录',
          '查看我本月的考勤和排班',
          '查一下本月员工薪酬核算汇总报表',
        ]
      : [
          '查看我当前账号拥有的角色与菜单权限',
          '查询我自己的请假申请记录和审批状态',
          '我想申请明天年假1天，事由为家中有事',
          '查看公司最新发布的通知公告',
        ];

    return {
      username: currentUser.username,
      isAdmin,
      allowedTools,
      promptSuggestions,
    };
  }

  /**
   * 统一准备上下文消息数组与动态工具集
   */
  private async prepareConversation(
    message: string,
    history: AgentChatMessageDto[],
    currentUser: CurrentUserPayload,
  ): Promise<{
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    toolsPayload: OpenAI.Chat.Completions.ChatCompletionTool[];
  }> {
    const myEmpId =
      await this.schemaInspector.resolveCurrentEmployeeId(currentUser);
    const authorizedEndpoints =
      this.apiGateway.getAuthorizedEndpoints(currentUser);

    const toolsPayload: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
    if (authorizedEndpoints.length > 0) {
      toolsPayload.push(CALL_BUSINESS_API_TOOL);
    }

    const systemPrompt = this.buildSystemPrompt(currentUser, myEmpId);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 保留最近 8 条历史，若末尾与本次用户消息完全重复则自动去重
    const recentHistory = history.slice(-8);
    for (let i = 0; i < recentHistory.length; i++) {
      const h = recentHistory[i];
      const isDuplicateTail =
        i === recentHistory.length - 1 &&
        h.role === 'user' &&
        h.content === message;
      if (isDuplicateTail) continue;

      messages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      });
    }

    messages.push({ role: 'user', content: message });
    return { messages, toolsPayload };
  }

  /**
   * 统一分发两大通用引擎工具调用
   */
  private async dispatchGenericTool(
    fnName: string,
    args: Record<string, any>,
    currentUser: CurrentUserPayload,
    authHeader: string,
    allowDestructiveConfirm: boolean,
  ): Promise<AgentToolResult> {
    if (fnName === 'query_system_data') {
      return {success:false,title:'数据查询',resultSummary:'请使用已授权业务 API 查询',data:{error:'RAW_SQL_DISABLED'}};
    }

    if (fnName === 'call_business_api') {
      // 防幻觉加固：仅当存在前序助手提示且用户本轮消息明确表达确认时，才允许 confirmed=true 透传生效
      const safeConfirmed =
        args.confirmed === true && allowDestructiveConfirm === true;

      return this.apiGateway.executeApiCall(
        {
          method: String(args.method || ''),
          path: String(args.path || ''),
          pathParams: args.pathParams,
          query: args.query,
          body: args.body,
          targetName: args.targetName ? String(args.targetName) : undefined,
          confirmed: safeConfirmed,
        },
        currentUser,
        authHeader,
      );
    }

    return {
      success: false,
      title: fnName,
      resultSummary: `未知工具 [${fnName}]，仅支持 query_system_data 与 call_business_api`,
      data: { error: 'UNKNOWN_TOOL' },
    };
  }

  /**
   * 校验用户是否在多轮上下文中对高危操作做出了真实明确的人工确认
   */
  private hasExplicitUserConfirmation(
    message: string,
    history: AgentChatMessageDto[],
  ): boolean {
    const hasPriorAssistantTurn = history.some((h) => h.role === 'assistant');
    if (!hasPriorAssistantTurn) {
      return false;
    }
    const trimmed = (message || '').trim();
    const isCancel = /(取消|不予|不要|放弃|算了|停止)/.test(trimmed);
    if (isCancel) {
      return false;
    }
    return /(确认|确定|同意|准许|立即执行|继续执行|^是$|^好的$|^yes$)/i.test(
      trimmed,
    );
  }

  private safeParseArgs(raw?: string): Record<string, any> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private resolveRunningTitle(
    fnName: string,
    args: Record<string, any>,
  ): string {
    if (fnName === 'query_system_data') {
      return args.purpose ? `数据查询：${args.purpose}` : '正在查询系统数据';
    }
    if (fnName === 'call_business_api') {
      return `调用接口：${String(args.method || '').toUpperCase()} ${args.path || ''}`.trim();
    }
    return fnName;
  }

  /**
   * 动态构建包含身份映射、全系统数据表结构与授权接口目录的系统提示词
   */
  private buildSystemPrompt(currentUser: CurrentUserPayload, myEmpId: number | null): string {
    return [
      '你是人事管理系统助手。仅使用 call_business_api 调用下方显式开放的业务接口，查询和自助申请均受服务器权限与数据范围约束。',
      '当前时间：'+new Date().toISOString(),
      '登录账号：'+currentUser.username+'；员工ID：'+(myEmpId ?? '未关联')+'；部门ID：'+(currentUser.deptId ?? '未分配'),
      '未指定对象时默认查询本人；不得用姓名推断员工身份，不得推测或编造申请人、金额、统计结果。接口返回拒绝时说明权限不足，不得换用 SQL。',
      '删除、授权、发薪、审批和修改人事档案请引导用户进入业务页面操作。申请缺少必要参数时说明所需信息。',
      '所有查询必须选下方目录中的 GET 接口，路径参数通过 pathParams 传递，筛选及分页通过 query 传递，表单通过 body 传递。用简体中文回答。',
      '已授权业务接口目录：', this.apiGateway.buildAuthorizedApiPrompt(currentUser),
    ].join('\n');
  }
}
