import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  userId: number;
  username: string;
  roles: string[];
  permissions: string[];
  deptId?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ||
        'hr_jwt_secret_dev_2026_key',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.userId) {
      throw new UnauthorizedException('凭证无效或已过期');
    }
    return payload;
  }
}
