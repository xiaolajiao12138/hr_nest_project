import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { MenuService } from '../services/menu.service';
import { LoginDto, RefreshTokenDto } from '../dto/auth.dto';
import { Public, JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * 用户身份认证与权限授信控制器
 * 提供验证码生成、账号密码安全登录、双 Token 无感刷新、当前登录人信息获取及动态路由树清单下发
 */
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly menuService: MenuService,
  ) {}

  /**
   * 获取登录图形验证码
   * 生成 SVG 验证码文本与 Base64 矢量图片，并将验证码存储至缓存中用于校验
   *
   * @returns 返回包含 captchaId 与 base64 图片字符串的对象
   */
  @Public()
  @Get('captcha')
  async getCaptcha() {
    return this.authService.generateCaptcha();
  }

  /**
   * 账号密码登录
   * 执行验证码校验、账号状态核实、BCrypt 密码比对，并签发短效 AccessToken 与长效 RefreshToken
   *
   * @param loginDto 登录入参（username、password、captchaId、captchaCode）
   * @returns 返回双 Token 及用户信息
   * @throws {BusinessException} 验证码错误、账号不存在或密码不匹配时抛出业务异常
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * 刷新 Token（无感续签）
   * 使用长效 RefreshToken 安全换发全新的短效 AccessToken，避免用户因 Token 过期而频繁被踢出系统
   *
   * @param dto 包含 refreshToken 的入参对象
   * @returns 返回全新签发的 accessToken 和 refreshToken
   * @throws {UnauthorizedException} 当 RefreshToken 非法或已过期时抛出未授权异常
   */
  @Public()
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /**
   * 获取当前登录用户的基本信息与按钮级权限标识列表
   *
   * @param user 从当前请求 JWT 载荷中解析出的用户信息
   * @returns 返回包含用户详情、所属角色与 permissions 权限码集合的对象
   * @throws {UnauthorizedException} 当凭证丢失时抛出未授权异常
   */
  @Get('user-info')
  async getUserInfo(@CurrentUser() user: CurrentUserPayload) {
    if (!user?.userId) {
      throw new UnauthorizedException('凭证无效，请重新登录');
    }
    return this.authService.getUserInfo(user.userId);
  }

  /**
   * 获取当前用户所拥有的动态菜单路由清单【重点权限接口】
   * 前端系统在用户登录成功后调用此接口获取菜单路由树，动态注册 Vue-Router 并渲染左侧侧边栏
   *
   * @param user 当前登录用户上下文
   * @returns 返回已清洗并按父子结构层级排序的动态菜单路由树
   * @throws {UnauthorizedException} 当凭证无效时抛出未授权异常
   */
  @Get('routes')
  async getDynamicRoutes(@CurrentUser() user: CurrentUserPayload) {
    if (!user?.userId) {
      throw new UnauthorizedException('凭证无效，请重新登录');
    }
    return this.menuService.getRoutesByUserId(user.userId);
  }
}
