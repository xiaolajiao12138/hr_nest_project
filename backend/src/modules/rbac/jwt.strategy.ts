import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthCacheService } from './services/auth-cache.service';

export interface JwtPayload {
  userId: number;
  username: string;
  roles: string[];
  permissions: string[];
  deptId?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authCacheService: AuthCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ||
        'hr_jwt_secret_dev_2026_key',
    });
  }

  /**
   * 拦截校验 JWT 凭证并动态组装运行时上下文用户实体
   * 彻底打破传统静态 JWT 绑定死角：动态联查 Redis 权威权限与账号启停状态
   */
  async validate(payload: JwtPayload) {
    if (!payload || !payload.userId) {
      throw new UnauthorizedException('凭证无效或已过期');
    }

    // 从权限缓存/数据库获取该用户当前最新的权威权限与状态（企业级热生效核心）
    const userAuth = await this.authCacheService.getUserAuthorities(payload.userId);
    if (!userAuth) {
      throw new UnauthorizedException('当前登录账号不存在或已被移除');
    }

    if (userAuth.status !== 1) {
      throw new UnauthorizedException('当前账号已被管理员停用，请联系管理员');
    }

    return {
      userId: userAuth.userId,
      username: userAuth.username,
      roles: userAuth.roles,
      permissions: userAuth.permissions,
      deptId: userAuth.deptId ?? payload.deptId,
    };
  }
}
