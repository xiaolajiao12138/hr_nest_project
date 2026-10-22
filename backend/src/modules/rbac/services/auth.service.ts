import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RedisService } from '../../../common/redis/redis.service';
import { LoginDto, RefreshTokenDto } from '../dto/auth.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import * as bcrypt from 'bcryptjs';
import * as svgCaptcha from 'svg-captcha';
import { MenuService } from './menu.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly menuService: MenuService,
  ) {}

  /**
   * 生成纯数字图形验证码（简单直观易辨识）
   */
  async generateCaptcha() {
    const captcha = svgCaptcha.create({
      size: 4,
      fontSize: 48,
      width: 120,
      height: 40,
      background: '#f4f5f9',
      noise: 1, // 降低干扰线噪点，清晰易认
      color: true,
      charPreset: '0123456789', // 纯4位阿拉伯数字
    });

    const uuid = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // 存入 Redis，有效期 2 分钟 (120秒)，小写存储
    await this.redisService.set(
      `captcha:${uuid}`,
      captcha.text.toLowerCase(),
      120,
    );

    return {
      uuid,
      img: `data:image/svg+xml;utf8,${encodeURIComponent(captcha.data)}`,
    };
  }

  /**
   * 账号密码 + 图形验证码登录
   */
  async login(loginDto: LoginDto) {
    const { username, password, code, uuid } = loginDto;

    // 1. 校验验证码
    const cachedCode = await this.redisService.get(`captcha:${uuid}`);
    if (!cachedCode) {
      throw new BusinessException('验证码已过期，请重新获取');
    }
    if (cachedCode !== code.trim().toLowerCase()) {
      throw new BusinessException('验证码错误，请重新输入');
    }
    // 验证通过立即销毁验证码
    await this.redisService.del(`captcha:${uuid}`);

    // 2. 查询用户及角色（需要包含 password 字段）
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'roles')
      .where('user.username = :username', { username })
      .getOne();

    if (!user) {
      throw new BusinessException('账号或密码不正确');
    }

    if (user.status !== 1) {
      throw new BusinessException('该账号已被停用，请联系管理员');
    }

    // 3. 校验密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BusinessException('账号或密码不正确');
    }

    // 4. 获取用户角色与按钮权限
    const roleKeys = (user.roles || []).map((r) => r.roleKey);
    const permissions = await this.menuService.getPermissionsByUserId(user.id);

    // 5. 签发 AccessToken 与 RefreshToken
    const payload = {
      userId: user.id,
      username: user.username,
      roles: roleKeys,
      permissions,
      deptId: user.deptId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get('jwt.refreshSecret') ||
        'hr_refresh_token_secret_dev_2026_key',
      expiresIn: this.configService.get('jwt.refreshExpiresIn') || '7d',
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get('jwt.expiresIn') || '7200s',
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        avatar: user.avatar,
        phone: user.phone,
        email: user.email,
        roles: roleKeys,
      },
    };
  }

  /**
   * 刷新 Token
   */
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const refreshSecret =
        this.configService.get('jwt.refreshSecret') ||
        'hr_refresh_token_secret_dev_2026_key';
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: refreshSecret,
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.userId },
        relations: ['roles'],
      });

      if (!user || user.status !== 1) {
        throw new UnauthorizedException('用户不存在或已失效');
      }

      const roleKeys = (user.roles || []).map((r) => r.roleKey);
      const permissions = await this.menuService.getPermissionsByUserId(user.id);

      const newPayload = {
        userId: user.id,
        username: user.username,
        roles: roleKeys,
        permissions,
        deptId: user.deptId,
      };

      const newAccessToken = this.jwtService.sign(newPayload);
      return {
        accessToken: newAccessToken,
        tokenType: 'Bearer',
        expiresIn: this.configService.get('jwt.expiresIn') || '7200s',
      };
    } catch (e) {
      throw new UnauthorizedException('RefreshToken 已过期或无效，请重新登录');
    }
  }

  /**
   * 获取当前登录用户信息、角色和权限
   */
  async getUserInfo(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'dept'],
    });
    if (!user) {
      throw new BusinessException('用户不存在');
    }

    const roleKeys = (user.roles || []).map((r) => r.roleKey);
    const permissions = await this.menuService.getPermissionsByUserId(user.id);

    return {
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
        avatar: user.avatar,
        dept: user.dept ? { id: user.dept.id, deptName: user.dept.deptName } : null,
      },
      roles: roleKeys,
      permissions,
    };
  }
}
