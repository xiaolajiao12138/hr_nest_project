import { Controller, Sse, Req, Query, UnauthorizedException, Logger, MessageEvent } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SseService } from './sse.service';

/**
 * SSE 服务端实时推送端点控制器
 * 负责接收浏览器 EventSource 长连接请求，执行身份认证，并返回 RxJS 响应式事件流
 */
@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(
    private readonly sseService: SseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 实时推送流服务端端点 (Server-Sent Events)
   * 建立 HTTP 规范长连接，支持通过 URL Query 参数 `?token=xxx` 或 Header `Authorization: Bearer xxx` 进行 JWT 身份认证
   * 客户端保持长连接期间，可实时接收全员公告、审批状态回执及徽标变动推送
   *
   * @param req Express 请求对象，用于监听客户端断开事件
   * @param queryToken 通过 URL 查询参数传递的 JWT Token（浏览器原生 EventSource 不支持直接自定义 Header）
   * @returns 返回符合 SSE 格式的数据推送 Observable 流
   * @throws {UnauthorizedException} 当未提供凭证或凭证已过期/非法时抛出未授权异常
   */
  @Sse('stream')
  stream(
    @Req() req: Request,
    @Query('token') queryToken?: string,
  ): Observable<MessageEvent> {
    // 1. 提取身份凭证 Token（优先兼容原生 EventSource 的 Query 传递，兼顾标准 Header 传递）
    let token = queryToken;
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      throw new UnauthorizedException('建立 SSE 连接失败: 未提供有效凭证');
    }

    // 2. 校验 Token 合法性并解析绑定的当前登录用户 ID
    let userId: number;
    try {
      const secret =
        this.configService.get<string>('jwt.secret') ||
        'hr_jwt_secret_dev_2026_key';
      const decoded: any = this.jwtService.verify(token, { secret });
      userId = Number(decoded.userId);
      if (!userId) {
        throw new Error('无效的 Token 载荷: 缺少 userId');
      }
    } catch (err: any) {
      this.logger.warn(`[SSE] 鉴权失败: ${err.message}`);
      throw new UnauthorizedException('Token 无效或已过期');
    }

    // 3. 监听网络波动或客户端主动关闭窗口/注销导致的 TCP 连接中断，及时回收内存
    req.on('close', () => {
      this.sseService.removeClient(userId);
    });

    // 4. 返回 RxJS 响应式事件流，建立持续单向推送通道
    return this.sseService.addClient(userId);
  }
}
