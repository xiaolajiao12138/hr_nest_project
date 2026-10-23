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
import { RsaService } from '../../../common/security/rsa.service';

/**
 * 身份认证与安全鉴权核心服务类
 * 
 * 核心安全机制：
 * 1. 纯数字 SVG 图形验证码生成与 Redis 防刷校验（单次有效、阅后即焚）
 * 2. 账号密码登录认证：bcrypt 哈希安全对比、账号启用停用拦截
 * 3. 双 Token 鉴权体系：签发短期 AccessToken (2小时) 与长期 RefreshToken (7天)
 * 4. 无感刷新 Token：基于长效 RefreshToken 实现客户端免密自动换新 AccessToken
 * 5. 用户上下文提取：聚合当前用户拥有的角色清单与按钮权限标识
 */
@Injectable()
export class AuthService {
  /**
   * 构造函数注入用户仓储、JWT服务、配置、Redis缓存及菜单权限服务
   * 
   * @param userRepo 系统用户仓储
   * @param jwtService NestJS JWT 签名与验签服务
   * @param configService 全局配置服务
   * @param redisService Redis 分布式缓存服务（存储验证码与 Token 黑名单）
   * @param menuService 菜单与权限标识查询服务
   */
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly menuService: MenuService,
    private readonly rsaService: RsaService,
  ) {}

  /**
   * 生成纯数字防机器刷取的 SVG 图形验证码
   * 
   * @returns 包含唯一 uuid 和可供前端直接渲染的 data:image/svg+xml base64 图片字符串
   */
  async generateCaptcha() {
    // 实例化 svg-captcha，采用 4 位纯数字配置，噪点适中避免人眼辨识困难
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
    // 写入 Redis 缓存，TTL 限制 120 秒，小写统一存储
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
   * 账号密码与图形验证码统一登录
   * 
   * 安全流程：
   * 1. 提取 Redis 缓存比对验证码，校验成功立即 DEL 删除实现单次有效；
   * 2. 查询用户基本信息及密码哈希（排除非活跃/已停用账号）；
   * 3. 使用 bcrypt.compare 慢哈希验证密码安全性；
   * 4. 组装用户角色与权限数组，签发短期 AccessToken 与长期 RefreshToken。
   * 
   * @param loginDto 登录请求载荷（账号、密码、验证码及对应 uuid）
   * @returns 认证凭证与用户简要资料
   * @throws BusinessException 当验证码过期/错误、账号不存在、被停用或密码不匹配时抛出
   */
  async login(loginDto: LoginDto) {
    const { username, password, code, uuid } = loginDto;

    // 1. 校验验证码有效性
    const cachedCode = await this.redisService.get(`captcha:${uuid}`);
    if (!cachedCode) {
      throw new BusinessException('验证码已过期，请重新获取');
    }
    if (cachedCode !== code.trim().toLowerCase()) {
      throw new BusinessException('验证码错误，请重新输入');
    }
    // 验证通过立即销毁验证码，杜绝重放攻击
    await this.redisService.del(`captcha:${uuid}`);

    // 2. 查询用户及关联角色（需要强制 select 包含隐藏的 password 字段）
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'roles')
      .where('user.username = :username', { username })
      .getOne();

    if (!user) {
      throw new BusinessException('账号或密码不正确');
    }

    // 检查账号状态：1 为正常，非 1 属于停用/禁用状态
    if (user.status !== 1) {
      throw new BusinessException('该账号已被停用，请联系管理员');
    }

    // 3. 校验密码哈希 (支持 RSA 密文自动解密，并向下兼容明文)
    const plainPassword = this.rsaService.decrypt(password);
    const isPasswordValid = await bcrypt.compare(plainPassword, user.password);
    if (!isPasswordValid) {
      throw new BusinessException('账号或密码不正确');
    }

    // 4. 获取用户角色与按钮细粒度权限列表
    const roleKeys = (user.roles || []).map((r) => r.roleKey);
    const permissions = await this.menuService.getPermissionsByUserId(user.id);

    // 5. 组装 JWT 载荷并双 Token 签名
    const payload = {
      userId: user.id,
      username: user.username,
      roles: roleKeys,
      permissions,
      deptId: user.deptId,
    };

    // 签发访问 Token
    const accessToken = this.jwtService.sign(payload);
    // 签发刷新 Token（使用独立的刷新秘钥与更长过期时间）
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
   * 基于长效 RefreshToken 无感换取新的短期 AccessToken
   * 
   * @param dto 包含客户端存储的 refreshToken
   * @returns 签发的最新 AccessToken
   * @throws UnauthorizedException 当刷新凭证失效、过期或对应用户已停用时抛出 401
   */
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const refreshSecret =
        this.configService.get('jwt.refreshSecret') ||
        'hr_refresh_token_secret_dev_2026_key';
      // 验证 RefreshToken 真实性与时效
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: refreshSecret,
      });

      // 实时验证账号当前最新可用状态
      const user = await this.userRepo.findOne({
        where: { id: payload.userId },
        relations: ['roles'],
      });

      if (!user || user.status !== 1) {
        throw new UnauthorizedException('用户不存在或已失效');
      }

      // 重新拉取最新角色与权限
      const roleKeys = (user.roles || []).map((r) => r.roleKey);
      const permissions = await this.menuService.getPermissionsByUserId(user.id);

      const newPayload = {
        userId: user.id,
        username: user.username,
        roles: roleKeys,
        permissions,
        deptId: user.deptId,
      };

      // 重新签发 AccessToken
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
   * 依据当前登录用户 ID 获取用户详细档案、部门、角色列表与细粒度按钮权限
   * 
   * @param userId 当前操作人主键 ID
   * @returns 用户聚合信息
   * @throws BusinessException 用户不存在时抛出
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
