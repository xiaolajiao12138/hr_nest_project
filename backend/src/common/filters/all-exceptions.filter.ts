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
 * 全局统一异常过滤器
 * 细分处理业务异常、数据库异常、参数校验异常、系统未知异常
 * 并在生产环境下自动屏蔽原始堆栈信息
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';
    const maskStackError = process.env.MASK_STACK_ERROR === 'true' || isProduction;

    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部异常，请联系系统管理员';
    let rawError = '';

    if (exception instanceof BusinessException) {
      // 1. 自定义业务异常
      code = exception.getBusinessCode();
      const res = exception.getResponse() as any;
      message = typeof res === 'object' && res.msg ? res.msg : exception.message;
      rawError = exception.message;
    } else if (exception instanceof HttpException) {
      // 2. NestJS 内置 HTTP 异常（例如 400 Bad Request, 401 Unauthorized, 403 Forbidden 等）
      code = exception.getStatus();
      const res = exception.getResponse() as any;
      if (typeof res === 'object') {
        // class-validator 返回的 message 可能是数组
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
      // 3. TypeORM 数据库操作异常
      code = 500;
      message = maskStackError ? '数据库执行异常，请检查数据完整性' : (exception as any).message;
      rawError = (exception as any).detail || (exception as any).message;
    } else if (exception instanceof Error) {
      // 4. 普通 JS 运行时未知异常
      code = 500;
      message = maskStackError ? '系统繁忙，请稍后重试' : exception.message;
      rawError = exception.stack || exception.message;
    }

    // 记录错误日志
    this.logger.error(
      `[${request.method}] ${request.originalUrl} | Code: ${code} | Message: ${message} | RawError: ${rawError}`,
    );

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
