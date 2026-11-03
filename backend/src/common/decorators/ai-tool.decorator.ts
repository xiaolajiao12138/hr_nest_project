import { SetMetadata } from '@nestjs/common';
export const AI_TOOL_KEY = 'ai:tool';
/** 显式开放业务能力；查询和自助申请复用 HTTP 守卫、数据范围及审计。 */
export const AiTool = (mode: 'read' | 'self-service' = 'read') => SetMetadata(AI_TOOL_KEY, mode);
