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

/**
 * 业务操作日志记录拦截器
 * 
 * 核心机制：
 * 1. 扫描控制器方法上的 `@OperLog` 自定义元数据注解
 * 2. 统计接口调用的响应耗时（毫秒数）
 * 3. 提取操作人身份、客户端真实 IP、请求 URL、入参参数及出参摘要（自动截断防日志膨胀）
 * 4. 异步将审计日志持久化至 `sys_oper_log` 表，操作失败自动记录异常堆栈，且日志异常绝不阻塞主业务流程
 */
@Injectable()
export class OperLogInterceptor implements NestInterceptor {
  /**
   * 构造函数注入元数据反射器与全局数据库连接
   * 
   * @param reflector NestJS 元数据反射器
   * @param dataSource TypeORM 数据源
   */
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 拦截请求并对请求生命周期（成功/异常）实施审计埋点
   * 
   * @param context 当前 HTTP 执行上下文
   * @param next 调用链处理器
   * @returns 响应流管道
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 读取方法级别的 @OperLog 注解配置
    const operLogOptions = this.reflector.get<OperLogOptions>(
      OPER_LOG_KEY,
      context.getHandler(),
    );

    // 未标注 @OperLog 则不记录日志，直接放行
    if (!operLogOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const { method, originalUrl, body, query, ip, user } = request;
    const operName = user?.username || '匿名用户';

    // 参数安全截断处理，限制 1000 字符内防止超大报文拖慢数据库
    const safeParams = JSON.stringify({ ...query, ...body }).slice(0, 1000);

    return next.handle().pipe(
      tap({
        // 接口调用成功时触发
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
            status: 1, // 1: 成功
            costTime,
          });
        },
        // 接口调用抛出异常时触发
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
            status: 0, // 0: 失败
            errorMsg: (err.message || '未知错误').slice(0, 500),
            costTime,
          });
        },
      }),
    );
  }

  /**
   * 异步将操作日志写入数据库
   * 
   * @param logData 操作日志实体数据
   */
  private async saveLog(logData: any) {
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('sys_oper_log')
        .values(logData)
        .execute();
    } catch (e) {
      // 记录日志失败静默捕获，杜绝因日志记录异常导致主业务崩溃
    }
  }
}
