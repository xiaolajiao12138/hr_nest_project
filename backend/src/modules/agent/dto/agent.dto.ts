import { IsNotEmpty, IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 历史消息单项 DTO
 * 描述前序会话中的角色与上下文发言内容
 * 类似字段参考：OpenAI 官方规范中的 ChatCompletionMessageParam
 */
export class AgentChatMessageDto {
  /**
   * 消息角色
   * 可选值：'user' (用户) | 'assistant' (智能体/助手) | 'system' (系统预设)
   * 类似字段参考：sys_log 中的 oper_user_type
   */
  @IsNotEmpty({ message: '消息角色不能为空' })
  @IsString({ message: '消息角色必须为字符串类型' })
  role: 'user' | 'assistant' | 'system';

  /**
   * 历史消息文本内容
   * 类似字段参考：sys_notice 中的 notice_content
   */
  @IsNotEmpty({ message: '消息内容不能为空' })
  @IsString({ message: '消息内容必须为字符串类型' })
  content: string;
}

/**
 * 智能体对话请求载荷 DTO
 * 前端向后端提交自然语言指令和上下文历史
 * 类似 DTO 参考：CreateNoticeDto、QueryEmployeeDto
 */
export class AgentChatDto {
  /**
   * 当前用户输入的自然语言提示词或指令
   * 例如："帮我查询一下开发部有哪些在职员工" 或 "我想申请明天请假1天"
   * 第一个参数/字段作用：作为 LLM 智能体理解业务意图的核心输入
   * 类似字段参考：QueryEmployeeDto.keyword
   */
  @IsNotEmpty({ message: '用户指令输入不能为空' })
  @IsString({ message: '用户指令输入必须为文本字符串' })
  message: string;

  /**
   * 多轮交互历史记录列表（可选）
   * 允许前端传递最近 3~10 轮历史对话，以便大模型具备上下文记忆和连贯指代能力
   * 第二个参数/字段作用：提供多轮对话上下文上下文，辅助解析指代代词（如"刚才说的这个人"）
   * 类似字段参考：MenuTree 中的 children 嵌套结构
   */
  @IsOptional()
  @IsArray({ message: '历史记录必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => AgentChatMessageDto)
  history?: AgentChatMessageDto[];
}

/**
 * 智能体执行完毕后的工具调用跟踪信息
 * 供前端渲染对话过程卡片，增强系统的可解释性与透明度
 */
export interface AgentExecutedToolInfo {
  /**
   * 工具内部方法标识名称
   * 例如：'query_employees'、'apply_leave'
   * 类似字段参考：sys_menu 中的 perms 权限标识
   */
  name: string;

  /**
   * 工具中文可读名称
   * 例如：'查询员工档案'、'提交请假申请'
   * 类似字段参考：sys_menu 中的 title
   */
  title: string;

  /**
   * 该工具执行是否成功
   * true 表示正常返回数据，false 表示捕获到业务拦截或权限拒绝
   */
  success: boolean;

  /**
   * 工具执行后提炼的简要摘要信息
   * 例如："成功获取 5 条员工记录"、"权限校验未通过：无权查看薪资"
   * 类似字段参考：oper_log 中的 error_msg 或 oper_title
   */
  resultSummary: string;
}

/**
 * 高危敏感写操作人机协同（Human-in-the-Loop）确认动作结构
 * 当 AI 准备执行删除等不可逆操作时，前端渲染可点击的确认交互卡片
 */
export interface ConfirmationActionInfo {
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
 * 智能体对话响应实体
 */
export interface AgentChatResponse {
  /**
   * 最终智能体回复的自然语言内容（支持 Markdown 语法与表格格式）
   * 类似字段参考：sys_notice 中的 content
   */
  reply: string;

  /**
   * 本轮对话中智能体触发并实际调用的工具明细
   */
  executedTools: AgentExecutedToolInfo[];

  /**
   * 待人工二次确认的高危操作载荷（若有）
   */
  confirmationAction?: ConfirmationActionInfo;
}

/**
 * SSE 流式事件推送载荷定义
 */
export interface AgentStreamEvent {
  /**
   * 事件类型：
   * 'tool_start': 开始执行某项业务工具
   * 'tool_end': 某项工具执行完成
   * 'chunk': 最终回复的文本流式打字片段
   * 'done': 整轮对话及所有工具调度全部结束
   * 'error': 发生异常
   */
  type: 'tool_start' | 'tool_end' | 'chunk' | 'done' | 'error';

  /**
   * 文本打字片段内容（当 type === 'chunk' 时有效）
   */
  content?: string;

  /**
   * 当前调用的工具函数名
   */
  toolName?: string;

  /**
   * 工具中文展示标题
   */
  toolTitle?: string;

  /**
   * 工具执行后反馈摘要
   */
  toolSummary?: string;

  /**
   * 最终所有已执行的工具汇总列表（当 type === 'done' 时有效）
   */
  executedTools?: AgentExecutedToolInfo[];

  /**
   * 待人工核准的高危操作交互卡片（当 type === 'done' 时有效）
   */
  confirmationAction?: ConfirmationActionInfo;
}

/**
 * 当前登录用户的 Agent 功能权限与快捷问答推荐
 */
export interface AgentCapabilityInfo {
  /**
   * 当前登录用户名称
   */
  username: string;

  /**
   * 当前用户是否具备超级管理员角色 (admin)
   */
  isAdmin: boolean;

  /**
   * 当前用户获权可执行的工具标识列表
   */
  allowedTools: string[];

  /**
   * 推荐给用户的个性化快捷指令按钮
   */
  promptSuggestions: string[];
}
