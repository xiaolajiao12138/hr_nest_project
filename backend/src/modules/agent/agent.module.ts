import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentSchemaInspector } from './tools/agent-schema.inspector';
import { AgentApiGateway } from './tools/agent-api.gateway';

/**
 * 智能体功能模块 (AgentModule)
 *
 * 企业级零耦合设计：
 * - 不直接导入任何具体业务 Entity 或业务 Module；
 * - 通过全局 DataSource 元数据自动感知全系统数据表结构；
 * - 通过 DiscoveryModule (ModulesContainer + Reflector) 自动发现全系统授权业务接口与 DTO 约束。
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [AgentController],
  providers: [AgentService, AgentSchemaInspector, AgentApiGateway],
  exports: [AgentService],
})
export class AgentModule {}
