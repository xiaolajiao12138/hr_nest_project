import { Controller, Sse, Req, Query, UnauthorizedException, Logger, MessageEvent } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SseService } from './sse.service';

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
   * 支持通过 Query 参数 `?token=xxx` 或 Header `Authorization: Bearer xxx` 进行 JWT 身份认证
   */
  @Sse('stream')
  stream(
    @Req() req: Request,
    @Query('token') queryToken?: string,
  ): Observable<MessageEvent> {
    // 1. 提取 Token
    let token = queryToken;
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      throw new UnauthorizedException('建立 SSE 连接失败: 未提供有效凭证');
    }

    // 2. 校验 Token 并解析 UserId
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

    // 3. 监听客户端主动关闭/断开长连接
    req.on('close', () => {
      this.sseService.removeClient(userId);
    });

    // 4. 返回 RxJS 响应式事件流
    return this.sseService.addClient(userId);
  }
}
