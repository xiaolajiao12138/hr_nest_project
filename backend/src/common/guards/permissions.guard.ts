import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未配置权限注解，直接放行
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const currentUser = user as CurrentUserPayload;

    if (!currentUser) {
      throw new ForbiddenException('未获取到当前用户信息');
    }

    // 超级管理员角色拥有所有权限
    if (currentUser.roles?.includes('admin')) {
      return true;
    }

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
