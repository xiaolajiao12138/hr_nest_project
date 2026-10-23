import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StreamableFile } from '@nestjs/common';

/**
 * 统一标准 API 响应结构格式
 * 
 * @template T 实际业务数据载荷类型
 */
export interface ApiResponse<T> {
  /** 业务状态码：200 表示成功，非 200 表示各类业务错误 */
  code: number;
  /** 响应说明信息或成功提示 */
  msg: string;
  /** 响应主体数据 */
  data: T;
}

/**
 * 全局统一 HTTP 响应结构包装拦截器
 * 
 * 核心功能：
 * 1. 自动将 Controller 返回的普通对象包装为标准格式：`{"code": 200, "msg": "success", "data": ...}`
 * 2. 识别文件流 StreamableFile、二进制 Buffer 与 SSE 长连接事件流，自动绕过包装避免协议损坏
 * 3. 避免对已经含有 code 和 msg 字段的自定义结果进行重复包装
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | any>
{
  /**
   * 拦截请求并对响应结果执行管道处理
   * 
   * @param context 当前执行上下文
   * @param next 处理器管道
   * @returns 包装后的响应数据流
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | any> {
    return next.handle().pipe(
      map((data) => {
        // 1. 如果控制器直接返回了 StreamableFile 或 Buffer（如 Excel 导出、图片验证码流），直接原样返回
        if (data instanceof StreamableFile || Buffer.isBuffer(data)) {
          return data;
        }

        // 2. 如果是 SSE 长连接事件流 (含有 data 且无 code 字段的 MessageEvent)，豁免包装以保持 SSE 规范
        if (data && typeof data === 'object' && 'data' in data && !('code' in data)) {
          return data;
        }

        // 3. 如果返回值已经包含 code 和 msg 字段（已自定义结构），直接原样返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'msg' in data
        ) {
          return data;
        }

        // 4. 标准成功响应统一样式组装
        return {
          code: 200,
          msg: 'success',
          data: data !== undefined ? data : null,
        };
      }),
    );
  }
}
