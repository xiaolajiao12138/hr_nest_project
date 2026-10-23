import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { QueryFailedError } from 'typeorm';

/**
 * 全局统一异常捕获过滤器
 * 
 * 核心机制：
 * 1. 集中捕获业务异常 (BusinessException)、HTTP 标准异常、TypeORM 数据库异常与系统运行时错误
 * 2. 统一将底层各类 HTTP 错误码映射为标准 JSON 格式：`{ code, msg, data: null, timestamp, path }`，避免前端网络直接报红
 * 3. 生产环境安全脱敏：在生产环境自动隐藏原始 SQL、系统文件路径及堆栈详情，防止系统拓扑泄露
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /** 日志记录器实例 */
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * 异常统一拦截处理函数
   * 
   * @param exception 捕获到的异常对象
   * @param host 当前执行上下文参数宿主
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 判断当前运行环境是否为生产环境，决定是否脱敏异常信息
    const isProduction = process.env.NODE_ENV === 'production';
    const maskStackError = process.env.MASK_STACK_ERROR === 'true' || isProduction;

    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部异常，请联系系统管理员';
    let rawError = '';

    if (exception instanceof BusinessException) {
      // 1. 自定义业务异常：直接提取业务自定义状态码与明确中文提示
      code = exception.getBusinessCode();
      const res = exception.getResponse() as any;
      message = typeof res === 'object' && res.msg ? res.msg : exception.message;
      rawError = exception.message;
    } else if (exception instanceof HttpException) {
      // 2. NestJS 内置 HTTP 异常（400 校验异常、401 凭证过期、403 权限不足等）
      code = exception.getStatus();
      const res = exception.getResponse() as any;
      if (typeof res === 'object') {
        // 处理 class-validator 返回的校验错误数组（拼接为可读文本）
        if (Array.isArray(res.message)) {
          message = res.message.join('; ');
        } else {
          message = res.message || exception.message;
        }
      } else {
        message = String(res);
      }
      rawError = exception.message;
    } else if (exception instanceof QueryFailedError) {
      // 3. TypeORM 数据库底层执行异常（唯一约束冲突、外键受限等）
      code = 500;
      message = maskStackError ? '数据库执行异常，请检查数据完整性' : (exception as any).message;
      rawError = (exception as any).detail || (exception as any).message;
    } else if (exception instanceof Error) {
      // 4. 普通 JS 运行时未知异常
      code = 500;
      message = maskStackError ? '系统繁忙，请稍后重试' : exception.message;
      rawError = exception.stack || exception.message;
    }

    // 格式化输出错误日志，方便运维排查
    this.logger.error(
      `[${request.method}] ${request.originalUrl} | Code: ${code} | Message: ${message} | RawError: ${rawError}`,
    );

    // 统一以 200 HTTP 状态码返回，通过响应体内部 code 标示业务状态
    response.status(HttpStatus.OK).json({
      code,
      msg: message,
      data: null,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      ...(maskStackError ? {} : { debugError: rawError }),
    });
  }
}
