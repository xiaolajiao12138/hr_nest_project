import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 历史消息单项 DTO
 */
export class AgentChatMessageDto {
  @IsNotEmpty({ message: '消息角色不能为空' })
  @IsString({ message: '消息角色必须为字符串类型' })
  role: 'user' | 'assistant' | 'system';

  @IsNotEmpty({ message: '消息内容不能为空' })
  @IsString({ message: '消息内容必须为字符串类型' })
  content: string;
}

/**
 * 智能体对话请求载荷 DTO
 */
export class AgentChatDto {
  @IsNotEmpty({ message: '用户指令输入不能为空' })
  @IsString({ message: '用户指令输入必须为文本字符串' })
  message: string;

  /**
   * 关联的持久化会话主键 ID（可选：首次发起新对话时可不传，由服务端自动创建会话并返回）
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '会话ID必须为整数' })
  @Min(1, { message: '会话ID无效' })
  sessionId?: number;

  /**
   * 兼容前端传递的历史记录列表（当存在 sessionId 时服务端优先使用数据库权威历史）
   */
  @IsOptional()
  @IsArray({ message: '历史记录必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => AgentChatMessageDto)
  history?: AgentChatMessageDto[];
}

/**
 * 手动新建会话请求 DTO
 */
export class CreateAgentSessionDto {
  @IsOptional()
  @IsString({ message: '会话标题必须为字符串' })
  @MaxLength(100, { message: '会话标题最多100个字符' })
  title?: string;
}

/**
 * 重命名会话标题请求 DTO
 */
export class RenameAgentSessionDto {
  @IsNotEmpty({ message: '会话标题不能为空' })
  @IsString({ message: '会话标题必须为字符串' })
  @MaxLength(100, { message: '会话标题最多100个字符' })
  title: string;
}

/**
 * 智能体执行完毕后的工具调用跟踪信息
 */
export interface AgentExecutedToolInfo {
  name: string;
  title: string;
  success: boolean;
  resultSummary: string;
}

/**
 * 高危敏感写操作人机协同（Human-in-the-Loop）确认动作结构
 */
export interface ConfirmationActionInfo {
  action: string;
  targetId: number;
  targetName: string;
  prompt: string;
}

/**
 * 智能体对话响应实体
 */
export interface AgentChatResponse {
  reply: string;
  executedTools: AgentExecutedToolInfo[];
  confirmationAction?: ConfirmationActionInfo;
  sessionId?: number;
  sessionTitle?: string;
}

/**
 * SSE 流式事件推送载荷定义
 */
export interface AgentStreamEvent {
  /**
   * 事件类型：
   * 'session': 绑定并返回当前持久化的会话 ID 与标题
   * 'tool_start': 开始执行某项业务工具
   * 'tool_end': 某项工具执行完成
   * 'chunk': 最终回复的文本流式打字片段
   * 'done': 整轮对话及所有工具调度全部结束
   * 'error': 发生异常
   */
  type: 'session' | 'tool_start' | 'tool_end' | 'chunk' | 'done' | 'error';

  sessionId?: number;
  sessionTitle?: string;
  content?: string;
  toolName?: string;
  toolTitle?: string;
  toolSummary?: string;
  executedTools?: AgentExecutedToolInfo[];
  confirmationAction?: ConfirmationActionInfo;
}

/**
 * 当前登录用户的 Agent 功能权限与快捷问答推荐
 */
export interface AgentCapabilityInfo {
  username: string;
  isAdmin: boolean;
  allowedTools: string[];
  promptSuggestions: string[];
}
