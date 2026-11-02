import request from '@/utils/request';
import { getToken } from '@/utils/auth';

/**
 * 高危敏感操作人机协同（Human-in-the-Loop）二次确认卡片数据
 */
export interface ConfirmationActionItem {
  /**
   * 动作标识，例如 'delete_employee'
   */
  action: string;

  /**
   * 目标对象主键 ID
   */
  targetId: number;

  /**
   * 目标对象名称或描述，例如 '李四'
   */
  targetName: string;

  /**
   * 向用户展示的警示确认文本
   */
  prompt: string;
}

/**
 * 历史消息单项接口
 * 用于在前端与后端之间同步多轮会话上下文
 * 类似实体参考：ChatMessage
 */
export interface ChatMessageItem {
  /**
   * 发言角色
   * 'user': 用户输入
   * 'assistant': AI 智能体回答
   * 'system': 系统预设引导
   */
  role: 'user' | 'assistant' | 'system';

  /**
   * 消息文本正文内容（支持 Markdown 语法排版）
   */
  content: string;

  /**
   * 前端本地记录生成时间戳字符串
   */
  timestamp?: string;

  /**
   * 当前轮次执行的工具追踪快照列表（可选）
   */
  executedTools?: ExecutedToolItem[];

  /**
   * 高危敏感写操作二次核准卡片载荷（可选）
   */
  confirmationAction?: ConfirmationActionItem;

  /**
   * 当前二次确认卡片是否已经被人工点击处理（避免重复点击）
   */
  isConfirmationHandled?: boolean;
}

/**
 * 智能体执行完毕后的工具动作跟踪明细
 */
export interface ExecutedToolItem {
  /**
   * 工具内部函数标识，例如 'query_employees'、'apply_leave'
   */
  name: string;

  /**
   * 工具中文友好展示名称，例如 '查询员工档案'、'提交请假申请'
   */
  title: string;

  /**
   * 是否执行成功
   */
  success: boolean;

  /**
   * 工具执行后反馈的人类可读摘要，例如 '成功检索到 12 条员工记录'
   */
  resultSummary: string;
}

/**
 * 智能体对话发送载荷参数对象
 * 类似 DTO 参考：QueryEmployeeDto
 */
export interface AgentChatPayload {
  /**
   * 当前用户输入的自然语言问题或业务指令
   * 例如："帮我查一下部门列表"、"我想申请明天年假1天"
   * 第一个参数/字段作用：作为触发 AI 思考与 Function Calling 调用的核心输入
   */
  message: string;

  /**
   * 历史交互轮次消息列表（可选）
   * 第二个参数/字段作用：提供上下文指代支持，使 AI 能理解连续提问
   */
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

/**
 * 智能体对话接口服务端响应数据实体
 */
export interface AgentChatResult {
  /**
   * 最终由大模型总结或生成的自然语言回答（Markdown 格式）
   */
  reply: string;

  /**
   * 本轮对话触发并完成执行的工具追踪列表
   */
  executedTools: ExecutedToolItem[];

  /**
   * 待人工二次确认的高危操作载荷（若有）
   */
  confirmationAction?: ConfirmationActionItem;
}

/**
 * 当前登录用户的 AI 助手能力清单与推荐引导信息
 */
export interface AgentCapabilitiesResult {
  /**
   * 当前登录用户的系统账号
   */
  username: string;

  /**
   * 是否具备超级管理员特权角色 (admin)
   */
  isAdmin: boolean;

  /**
   * 当前用户获权执行的底层业务工具名称集合
   */
  allowedTools: string[];

  /**
   * 适合当前用户权限角色的个性化快捷提问提示词
   */
  promptSuggestions: string[];
}

/**
 * 向 HR 数字化智能体发送自然语言对话请求（标准 JSON 模式）
 * 
 * @param data 对话入参载荷对象
 *   - 第一个参数作用：包含当前用户最新输入的 message 与历史对话 history
 *   - 类似方法参数参考：createEmployeeApi(data)、updateEmployeeApi(id, data)
 * @returns Promise<AgentChatResult> 返回最终 AI 回复与工具调用追踪
 */
export function chatWithAgentApi(data: AgentChatPayload): Promise<AgentChatResult> {
  return request({
    url: '/agent/chat',
    method: 'post',
    data,
    timeout: 90000,
  });
}

/**
 * 基于 SSE 流式传输驱动智能体自然语言对话（实时打字机与工具状态回显）
 * 
 * @param data 对话请求体载荷
 *   - 第一个参数作用：包含用户最新输入指令 message 与前序历史 history
 * @param onEvent 接收到后端流式事件时的实时回调函数
 *   - 第二个参数作用：包含 tool_start (工具开始), tool_end (工具结束), chunk (打字片段), done (完成) 等事件
 * @param onError 网络或服务端解析异常时的错误捕获回调
 *   - 第三个参数作用：处理异常提示
 */
export async function chatWithAgentStreamApi(
  data: AgentChatPayload,
  onEvent: (event: any) => void,
  onError: (error: Error) => void,
): Promise<void> {
  const token = getToken();
  const apiPrefix = import.meta.env.VITE_API_PREFIX || '/api';
  const url = `${apiPrefix}/agent/chat-stream`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`网络响应异常: HTTP ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('当前浏览器环境不支持 ReadableStream 流式响应读取');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      // 保留最后一个可能未接收完整的块
      buffer = lines.pop() || '';

      for (const block of lines) {
        const trimmed = block.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.slice(6);
            const eventData = JSON.parse(jsonStr);
            onEvent(eventData);
          } catch (e) {
            // 忽略非完整 JSON 碎片
          }
        }
      }
    }
  } catch (err: any) {
    onError(err);
  }
}

/**
 * 获取当前登录用户的 AI 智能体权限能力概况与快捷提示词列表
 * 
 * @returns Promise<AgentCapabilitiesResult> 返回当前用户的角色特权、可用工具标识与推荐快捷指令
 * 类似接口参考：getUserInfoApi()、getRoutersApi()
 */
export function getAgentCapabilitiesApi(): Promise<AgentCapabilitiesResult> {
  return request({
    url: '/agent/capabilities',
    method: 'get',
  });
}
