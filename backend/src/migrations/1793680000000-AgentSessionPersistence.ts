import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI 智能体会话与消息明细持久化幂等迁移脚本
 * 用于生产环境（DB_SYNCHRONIZE=false）新旧数据库平滑升级自动建表
 */
export class AgentSessionPersistence1793680000000 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      CREATE TABLE IF NOT EXISTS sys_agent_session (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(120) NOT NULL DEFAULT '新对话',
        last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_session_user_id ON sys_agent_session(user_id);
      CREATE INDEX IF NOT EXISTS idx_agent_session_last_msg_at ON sys_agent_session(last_message_at);
    `);

    await query.query(`
      CREATE TABLE IF NOT EXISTS sys_agent_message (
        id SERIAL PRIMARY KEY,
        session_id INT NOT NULL,
        user_id INT NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        executed_tools JSONB,
        confirmation_action JSONB,
        is_confirmation_handled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_msg_session_id ON sys_agent_message(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_msg_user_id ON sys_agent_message(user_id);
    `);
  }

  async down(): Promise<void> {
    // 历史对话审计记录属于用户业务数据，回滚时不自动物理删除表
  }
}
