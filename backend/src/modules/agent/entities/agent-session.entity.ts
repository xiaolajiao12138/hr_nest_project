import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';

/**
 * AI 智能体会话表 (sys_agent_session)
 * 按登录用户 user_id 严格隔离，支持多设备/多窗口同步历史对话列表
 */
@Entity('sys_agent_session')
export class AgentSession extends BaseEntity {
  @Index('idx_agent_session_user_id')
  @Column({ name: 'user_id', type: 'int', comment: '所属系统用户ID' })
  userId: number;

  @Column({
    type: 'varchar',
    length: 120,
    default: '新对话',
    comment: '会话标题',
  })
  title: string;

  @Index('idx_agent_session_last_msg_at')
  @Column({
    name: 'last_message_at',
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '最后一条消息活跃时间',
  })
  lastMessageAt: Date;
}
