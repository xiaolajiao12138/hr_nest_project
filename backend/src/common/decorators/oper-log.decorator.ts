import { SetMetadata } from '@nestjs/common';

export const OPER_LOG_KEY = 'oper_log';

export interface OperLogOptions {
  title: string;
  businessType?: 'INSERT' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'IMPORT' | 'OTHER';
}

/**
 * 记录操作日志装饰器
 */
export const OperLog = (options: OperLogOptions) =>
  SetMetadata(OPER_LOG_KEY, options);
