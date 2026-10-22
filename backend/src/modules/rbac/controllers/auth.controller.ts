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

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly menuService: MenuService,
  ) {}

  /**
   * 获取登录图形验证码
   */
  @Public()
  @Get('captcha')
  async getCaptcha() {
    return this.authService.generateCaptcha();
  }

  /**
   * 账号密码登录
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * 刷新 Token
   */
  @Public()
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  /**
   * 获取当前登录用户信息与权限
   */
  @Get('user-info')
  async getUserInfo(@CurrentUser() user: CurrentUserPayload) {
    if (!user?.userId) {
      throw new UnauthorizedException('凭证无效，请重新登录');
    }
    return this.authService.getUserInfo(user.userId);
  }

  /**
   * 获取当前用户角色所对应的动态菜单路由清单【重点接口】
   * 前端登录后请求此接口，动态生成并挂载 addRoute
   */
  @Get('routes')
  async getDynamicRoutes(@CurrentUser() user: CurrentUserPayload) {
    if (!user?.userId) {
      throw new UnauthorizedException('凭证无效，请重新登录');
    }
    return this.menuService.getRoutesByUserId(user.userId);
  }
}
