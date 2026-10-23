import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * RBAC 按钮级别细粒度权限校验守卫
 * 
 * 校验流程：
 * 1. 优先提取当前路由方法或控制器类上的 `@Permissions(...)` 注解
 * 2. 若接口未配置任何权限注解，属于公开内部接口，直接放行
 * 3. 校验请求上下文中的当前登录用户实体
 * 4. 超级管理员角色（`roles` 包含 `admin`）拥有绝对通配权限，直接放行
 * 5. 校验用户持有的权限字符列表是否涵盖当前接口所需的所有权限标识（支持 `*` 全局通配符）
 * 6. 若不满足权限要求，即时中断并抛出 HTTP 403 Forbidden 异常
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  /**
   * 构造函数注入反射器
   * 
   * @param reflector NestJS 反射器，用于读取方法及类元数据
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   * 执行权限判断
   * 
   * @param context 执行上下文
   * @returns 是否允许访问目标路由
   * @throws ForbiddenException 用户未登录或缺少所需权限标识时抛出 403 异常
   */
  canActivate(context: ExecutionContext): boolean {
    // 提取方法或控制器类上的权限注解
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 1. 若当前接口未配置权限注解，属于基础放行接口
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const currentUser = user as CurrentUserPayload;

    if (!currentUser) {
      throw new ForbiddenException('未获取到当前用户信息');
    }

    // 2. 超级管理员拥有全量系统特权
    if (currentUser.roles?.includes('admin')) {
      return true;
    }

    // 3. 校验用户权限清单中是否具备目标权限标识
    const userPerms = currentUser.permissions || [];
    const hasPermission = requiredPermissions.every((perm) =>
      userPerms.includes(perm) || userPerms.includes('*'),
    );

    if (!hasPermission) {
      throw new ForbiddenException('您没有执行该操作的权限');
    }

    return true;
  }
}
