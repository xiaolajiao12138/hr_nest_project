import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import {
  AgentExecutedToolInfo,
  ConfirmationActionInfo,
} from '../dto/agent.dto';

/**
 * AI 智能体消息明细表 (sys_agent_message)
 * 持久化存储每轮用户提问、AI Markdown 回复、工具执行轨迹与二次确认状态
 */
@Entity('sys_agent_message')
export class AgentMessage extends BaseEntity {
  @Index('idx_agent_msg_session_id')
  @Column({ name: 'session_id', type: 'int', comment: '所属会话ID' })
  sessionId: number;

  @Index('idx_agent_msg_user_id')
  @Column({ name: 'user_id', type: 'int', comment: '所属系统用户ID' })
  userId: number;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '发言角色: user / assistant / system',
  })
  role: 'user' | 'assistant' | 'system';

  @Column({ type: 'text', comment: '消息Markdown正文内容' })
  content: string;

  @Column({
    name: 'executed_tools',
    type: 'jsonb',
    nullable: true,
    comment: '本轮执行的业务工具摘要列表',
  })
  executedTools: AgentExecutedToolInfo[] | null;

  @Column({
    name: 'confirmation_action',
    type: 'jsonb',
    nullable: true,
    comment: '高危写操作人机协同二次确认卡片载荷',
  })
  confirmationAction: ConfirmationActionInfo | null;

  @Column({
    name: 'is_confirmation_handled',
    type: 'boolean',
    default: false,
    comment: '二次确认卡片是否已被用户响应处理',
  })
  isConfirmationHandled: boolean;
}
