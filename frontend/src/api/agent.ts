import request from '@/utils/request';
import { getToken } from '@/utils/auth';

/**
 * 高危敏感操作人机协同（Human-in-the-Loop）二次确认卡片数据
 */
export interface ConfirmationActionItem {
  action: string;
  targetId: number;
  targetName: string;
  prompt: string;
}

/**
 * 智能体执行完毕后的工具动作跟踪明细
 */
export interface ExecutedToolItem {
  name: string;
  title: string;
  success: boolean;
  resultSummary: string;
}

/**
 * 聊天消息单项结构
 */
export interface ChatMessageItem {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  executedTools?: ExecutedToolItem[];
  confirmationAction?: ConfirmationActionItem;
  isConfirmationHandled?: boolean;
  createdAt?: string;
}

/**
 * 持久化历史会话单项结构
 */
export interface AgentSessionItem {
  id: number;
  userId: number;
  title: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * 指定会话的消息详情返回结构
 */
export interface AgentSessionMessagesResult {
  session: AgentSessionItem;
  messages: Array<{
    id: number;
    sessionId: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    executedTools?: ExecutedToolItem[] | null;
    confirmationAction?: ConfirmationActionItem | null;
    isConfirmationHandled?: boolean;
    createdAt?: string;
  }>;
}

/**
 * 智能体对话发送载荷参数对象
 */
export interface AgentChatPayload {
  message: string;
  sessionId?: number;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

/**
 * 智能体对话接口服务端响应数据实体
 */
export interface AgentChatResult {
  reply: string;
  executedTools: ExecutedToolItem[];
  confirmationAction?: ConfirmationActionItem;
  sessionId?: number;
  sessionTitle?: string;
}

/**
 * 当前登录用户的 AI 助手能力清单与推荐引导信息
 */
export interface AgentCapabilitiesResult {
  username: string;
  isAdmin: boolean;
  allowedTools: string[];
  promptSuggestions: string[];
}

// ==================== 会话持久化管理 API ====================

/**
 * 获取当前登录用户的历史会话列表（按最新活跃倒序）
 */
export function getAgentSessionsApi(keyword?: string): Promise<AgentSessionItem[]> {
  return request({
    url: '/agent/sessions',
    method: 'get',
    params: keyword ? { keyword } : undefined,
  });
}

/**
 * 显式新建一个空白会话
 */
export function createAgentSessionApi(title?: string): Promise<AgentSessionItem> {
  return request({
    url: '/agent/sessions',
    method: 'post',
    data: title ? { title } : {},
  });
}

/**
 * 获取指定会话下的完整持久化消息列表
 */
export function getAgentSessionMessagesApi(
  sessionId: number,
): Promise<AgentSessionMessagesResult> {
  return request({
    url: `/agent/sessions/${sessionId}/messages`,
    method: 'get',
  });
}

/**
 * 重命名指定会话标题
 */
export function renameAgentSessionApi(
  sessionId: number,
  title: string,
): Promise<AgentSessionItem> {
  return request({
    url: `/agent/sessions/${sessionId}`,
    method: 'patch',
    data: { title },
  });
}

/**
 * 删除指定历史会话及其全部关联消息
 */
export function deleteAgentSessionApi(
  sessionId: number,
): Promise<{ deleted: boolean }> {
  return request({
    url: `/agent/sessions/${sessionId}`,
    method: 'delete',
  });
}

/**
 * 清空指定会话下的全部消息记录
 */
export function clearAgentSessionMessagesApi(
  sessionId: number,
): Promise<{ cleared: boolean }> {
  return request({
    url: `/agent/sessions/${sessionId}/messages`,
    method: 'delete',
  });
}

// ==================== 智能体对话与能力 API ====================

/**
 * 向 HR 数字化智能体发送自然语言对话请求（标准 JSON 模式）
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
 * 基于 SSE 流式传输驱动智能体自然语言对话（支持首帧返回持久化 sessionId）
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
      buffer = lines.pop() || '';

      for (const block of lines) {
        const trimmed = block.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.slice(6);
            const eventData = JSON.parse(jsonStr);
            onEvent(eventData);
          } catch {
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
 */
export function getAgentCapabilitiesApi(): Promise<AgentCapabilitiesResult> {
  return request({
    url: '/agent/capabilities',
    method: 'get',
  });
}
