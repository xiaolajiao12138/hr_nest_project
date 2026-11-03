import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  userId: number;
  username: string;
  roles: string[];
  permissions: string[];
  deptId?: number;
  employeeId?: number;
  dataScopes?: Record<string, { all: boolean; deptIds: number[]; self: boolean }>;
}

/**
 * 获取当前登录用户的信息载荷
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;
    return data ? user?.[data] : user;
  },
);
