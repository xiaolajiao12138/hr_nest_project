import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StreamableFile } from '@nestjs/common';

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 全局统一返回结构拦截器
 * 统一包装为 {"code": 200, "msg": "success", "data": ...}
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | any>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | any> {
    return next.handle().pipe(
      map((data) => {
        // 如果控制器直接返回了 StreamableFile 或 Buffer（如文件导出/图片验证码），不作包装
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data;
        }

        // 如果返回值已经包含 code 和 msg 字段，直接返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'msg' in data
        ) {
          return data;
        }

        return {
          code: 200,
          msg: 'success',
          data: data !== undefined ? data : null,
        };
      }),
    );
  }
}
