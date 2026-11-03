import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentSessionService } from './agent-session.service';
import { AgentSession } from './entities/agent-session.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSchemaInspector } from './tools/agent-schema.inspector';
import { AgentApiGateway } from './tools/agent-api.gateway';

/**
 * 智能体功能模块 (AgentModule)
 *
 * 企业级零业务耦合 + 独立数据库会话持久化：
 * - 自身仅维护 sys_agent_session 与 sys_agent_message 两张会话存储表，不耦合任何具体 HR 业务 Entity；
 * - 通过 DiscoveryModule 自动发现全系统授权业务接口与 DTO 约束。
 */
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([AgentSession, AgentMessage]),
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentSessionService,
    AgentSchemaInspector,
    AgentApiGateway,
  ],
  exports: [AgentService, AgentSessionService],
})
export class AgentModule {}
