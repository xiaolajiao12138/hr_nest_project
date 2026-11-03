import { SetMetadata } from '@nestjs/common';
export const AI_TOOL_KEY = 'ai:tool';
export interface AiToolOptions {
  mode?: 'read' | 'self-service';
  description?: string;
}
/** 显式开放业务能力；查询和自助申请复用 HTTP 守卫、数据范围及审计。 */
export const AiTool = (options: AiToolOptions | 'read' | 'self-service' = 'read') =>
  SetMetadata(AI_TOOL_KEY, typeof options === 'string' ? { mode: options } : { mode: 'read', ...options });
