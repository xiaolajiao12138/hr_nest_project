import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OPER_LOG_KEY, OperLogOptions } from '../decorators/oper-log.decorator';
import { DataSource } from 'typeorm';

@Injectable()
export class OperLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const operLogOptions = this.reflector.get<OperLogOptions>(
      OPER_LOG_KEY,
      context.getHandler(),
    );

    // 未标注 @OperLog 则不记录
    if (!operLogOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const { method, originalUrl, body, query, ip, user } = request;
    const operName = user?.username || '匿名用户';

    // 过滤敏感字段不打印或截断
    const safeParams = JSON.stringify({ ...query, ...body }).slice(0, 1000);

    return next.handle().pipe(
      tap({
        next: (res) => {
          const costTime = Date.now() - startTime;
          this.saveLog({
            title: operLogOptions.title,
            businessType: operLogOptions.businessType || 'OTHER',
            method: `${context.getClass().name}.${context.getHandler().name}`,
            requestMethod: method,
            operName,
            operUrl: originalUrl,
            operIp: ip || '127.0.0.1',
            operParam: safeParams,
            jsonResult: JSON.stringify(res || {}).slice(0, 1000),
            status: 1,
            costTime,
          });
        },
        error: (err) => {
          const costTime = Date.now() - startTime;
          this.saveLog({
            title: operLogOptions.title,
            businessType: operLogOptions.businessType || 'OTHER',
            method: `${context.getClass().name}.${context.getHandler().name}`,
            requestMethod: method,
            operName,
            operUrl: originalUrl,
            operIp: ip || '127.0.0.1',
            operParam: safeParams,
            status: 0,
            errorMsg: (err.message || '未知错误').slice(0, 500),
            costTime,
          });
        },
      }),
    );
  }

  private async saveLog(logData: any) {
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('sys_oper_log')
        .values(logData)
        .execute();
    } catch (e) {
      // 记录日志失败不影响主业务
    }
  }
}
