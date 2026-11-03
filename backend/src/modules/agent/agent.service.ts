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
 * 统一调用显式开放的业务查询和自助申请。
 */
const CALL_BUSINESS_API_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'call_business_api',
    description:
      '调用已授权目录中的 GET 查询或 POST 自助申请。本人身份由后端账号绑定确定，不得要求用户提供员工ID替代身份。严格按目录选择 method、path、参数位置和枚举值。',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST'],
          description: 'HTTP 请求方法',
        },
        path: {
          type: 'string',
          description:
            '接口路径（如 /hr/employee/me 或 /hr/leave/my/apply，不含 /api 前缀）',
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
      },
      required: ['method', 'path'],
    },
  },
};

/**
 * 智能体中枢：能力来自业务模块显式声明，复用业务接口安全边界。
 *
 * 核心设计：
 * 查询和自助申请统一经 AgentApiGateway 携带登录凭证调用业务接口。
 * 新增能力由 Controller 的 @AiTool 及 DTO 描述，无须在 AI 模块导入业务模块。
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
      finalReply = this.toolLoopFallback(executedTools);
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

    if (!finalReplyText && executedTools.length > 0) {
      finalReplyText = this.toolLoopFallback(executedTools);
      onEvent({ type: 'chunk', content: finalReplyText });
    }

    if (this.sessionService && activeSessionId) {
      await this.sessionService.appendAssistantMessage(
        activeSessionId,
        currentUser.userId,
        {
          content: finalReplyText,
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
          '查看公司最新发布的通知公告',
        ];
    if (currentUser.employeeId && authorizedEndpoints.some(ep => ep.method === 'POST' && ep.path === '/hr/leave/my/apply')) {
      promptSuggestions.push('我想申请明天年假1天，事由为家中有事');
    }

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
      resultSummary: `未知工具 [${fnName}]，请使用 call_business_api`,
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

  private toolLoopFallback(tools: AgentExecutedToolInfo[]): string {
    const failed = tools.filter(tool => !tool.success);
    return failed.length
      ? '本次操作未完整完成：' + failed.map(tool => tool.resultSummary).join('；')
      : '已完成工具调用，但未生成完整答复。请以上方工具结果核对是否提交成功。';
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
   * 根据本轮可信身份、业务日期和授权接口目录构建上下文。
   */
  private buildSystemPrompt(currentUser: CurrentUserPayload, myEmpId: number | null): string {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    return [
      '你是人事管理系统助手。仅使用 call_business_api 调用下方显式开放的业务接口，查询和自助申请均受服务器权限与数据范围约束。',
      '业务时区：Asia/Shanghai；今天：'+dateFormatter.format(now)+'；明天：'+dateFormatter.format(new Date(now.getTime()+86400000))+'；当前时间：'+now.toISOString(),
      '登录账号：'+currentUser.username+'；员工ID：'+(myEmpId ?? '未关联')+'；部门ID：'+(currentUser.deptId ?? '未分配'),
      '本轮系统身份和已授权接口目录是唯一能力依据，历史助手关于接口未开放、账号未绑定的说法可能已过期。目录中存在的自助POST接口可以调用，不得凭历史回复声称接口未开放。',
      '未指定对象时默认查询本人；不得用姓名推断员工身份，不得推测或编造申请人、金额、统计结果。接口返回拒绝时说明权限不足，不得换用 SQL。',
      myEmpId
        ? '当前账号已关联员工。本人申请由自助接口根据登录身份确定申请人，不要向用户索要员工ID，不要用员工候选接口寻找本人。'
        : '当前账号尚未关联员工。若用户要求查本人身份，调用目录中的本人身份查询接口核实；绑定缺失时明确请管理员在用户管理中关联员工，停止个人申请，不得索要员工ID、接受用户报出的ID代替绑定或按姓名搜索冒认本人。',
      '用户已给出的日期、类型、天数和事由应从多轮对话中沿用，不要重复追问。整日或一天请假优先使用支持日期的本人整日申请接口，无需询问具体上下班时间；未明确请假类型时可以建议事假，但不能擅自确定类型。',
      '提交申请必须实际调用目录中的自助POST接口。仅当工具返回成功且有单号时才能说明已提交并展示单号及待审批状态；读取身份或余额成功不代表申请成功，失败、未绑定和未调用均应明确尚未提交。',
      '删除、授权、发薪、审批和修改人事档案请引导用户进入业务页面操作。申请缺少必要参数时说明所需信息。',
      '所有查询必须选下方目录中的 GET 接口，路径参数通过 pathParams 传递，筛选及分页通过 query 传递，表单通过 body 传递。用简体中文回答。',
      '已授权业务接口目录：', this.apiGateway.buildAuthorizedApiPrompt(currentUser),
    ].join('\n');
  }
}
