import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
export interface ResourceScope {
    all: boolean;
    deptIds: number[];
    self: boolean;
}
export type ScopeMode = 'SELF' | 'DEPT' | 'DEPT_AND_CHILDREN' | 'CUSTOM' | 'ALL';
export function isAdmin(user?: CurrentUserPayload): boolean {
    return !!user && (user.roles?.includes('admin') || user.permissions?.includes('*'));
}
export function requireAdmin(user?: CurrentUserPayload): void {
    if (!isAdmin(user))
        throw new ForbiddenException('仅系统管理员可维护账号授权和全局配置');
}
export function requirePermission(user: CurrentUserPayload, permission: string): void {
    if (!user || (!isAdmin(user) && !user.permissions?.includes(permission))) {
        throw new ForbiddenException('没有执行该操作的权限');
    }
}
export function scopeFor(user: CurrentUserPayload, resource: string): ResourceScope {
    if (!user?.userId)
        throw new ForbiddenException('缺少有效身份');
    if (isAdmin(user))
        return { all: true, deptIds: [], self: false };
    return user.dataScopes?.[resource] || { all: false, deptIds: [], self: true };
}
/** 范围在数据库查询前施加；请求中的部门、员工条件只能进一步缩小范围。 */
export function applyScope<T>(qb: SelectQueryBuilder<T>, user: CurrentUserPayload, resource: string, deptColumn: string, employeeColumn: string): SelectQueryBuilder<T> {
    const scope = scopeFor(user, resource);
    if (scope.all)
        return qb;
    const key = `scope_${resource.replace(/\W/g, '_')}`;
    return qb.andWhere(new Brackets(part => {
        part.where('1 = 0');
        if (scope.deptIds.length)
            part.orWhere(`${deptColumn} IN (:...${key})`, { [key]: scope.deptIds });
        if (scope.self && user.employeeId)
            part.orWhere(`${employeeColumn} = :${key}_self`, { [`${key}_self`]: user.employeeId });
    }));
}
export function assertScope(user: CurrentUserPayload, resource: string, empId: number, deptId: number): void {
    const scope = scopeFor(user, resource);
    if (scope.all || scope.deptIds.includes(Number(deptId)) || (scope.self && user.employeeId === Number(empId)))
        return;
    throw new NotFoundException('记录不存在或不在授权范围内');
}
export async function assertEmployeeScope(ds: Pick<DataSource, 'query'>, user: CurrentUserPayload, resource: string, empId: number) {
    const rows = await ds.query('SELECT id, dept_id FROM hr_employee WHERE id = $1', [empId]);
    if (!rows.length)
        throw new NotFoundException('记录不存在或不在授权范围内');
    assertScope(user, resource, Number(rows[0].id), Number(rows[0].dept_id));
}
export function assertDepartmentScope(user: CurrentUserPayload, resource: string, deptId: number): void {
    const scope = scopeFor(user, resource);
    if (!scope.all && !scope.deptIds.includes(Number(deptId)))
        throw new ForbiddenException('目标部门不在授权范围内');
}
export function requireEmployeeId(user: CurrentUserPayload): number {
    if (!user?.employeeId)
        throw new ForbiddenException('账号尚未关联员工档案，请联系管理员完成关联');
    return user.employeeId;
}
