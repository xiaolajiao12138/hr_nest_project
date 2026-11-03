import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { isAdmin, assertScope } from './data-scope';
/** 响应和审计双重兜底；业务服务仍需按资源授权并选择必要字段。 */
export function sanitizeResponse(value: any, user?: CurrentUserPayload): any {
    if (value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value))
        return value;
    if (Array.isArray(value))
        return value.map(v => sanitizeResponse(v, user));
    const employee = 'empNo' in value && 'name' in value;
    let sensitive = isAdmin(user);
    if (employee && !sensitive && user?.permissions?.includes('hr:employee:sensitive')) {
        try {
            assertScope(user, 'employee', Number(value.id), Number(value.deptId));
            sensitive = true;
        }
        catch { }
    }
    const result: any = {};
    for (const [key, item] of Object.entries(value)) {
        if (key !== 'hasPassword' && /password|salt|secret/i.test(key))
            continue;
        if (employee && !sensitive && ['idCardFrontId', 'idCardBackId', 'eduCertId', 'idCardFront', 'idCardBack', 'eduCert', 'salary'].includes(key))
            continue;
        if (employee && !sensitive && key === 'idCard') {
            result[key] = item ? String(item).replace(/^(.{3}).*(.{4})$/, '$1***********$2') : '';
            continue;
        }
        if (employee && !sensitive && key === 'phone') {
            result[key] = item ? String(item).replace(/^(\d{3})\d+(\d{4})$/, '$1****$2') : '';
            continue;
        }
        result[key] = sanitizeResponse(item, user);
    }
    return result;
}
export function redactAudit(value: any): any {
    if (value === null || typeof value !== 'object' || value instanceof Date)
        return value;
    if (Array.isArray(value))
        return value.map(redactAudit);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        /password|salt|secret|token|idcard|phone|salary|deduction|tax|housingfund|socialsecurity|allowance|score|comment|reason|remark|messages|content|authorization|signature|keyword|bank|address/i.test(key)
            ? '[已脱敏]' : redactAudit(item)]));
}
/** 历史日志也按当前安全规则读取，截断或非 JSON 旧报文不回显。 */
export function sanitizeLog<T extends Record<string, any>>(log: T): T {
    const result: any = { ...log, operUrl: log.operUrl?.split('?')[0] };
    for (const key of ['operParam', 'jsonResult']) {
        if (!log[key])
            continue;
        try {
            const value = JSON.parse(log[key]);
            result[key] = JSON.stringify(key === 'jsonResult' ? { id: value?.id, success: value?.success } : redactAudit(value));
        }
        catch {
            result[key] = '[历史报文已隐藏]';
        }
    }
    if (log.errorMsg)
        result.errorMsg = '操作失败，详细诊断仅供服务器管理员查看';
    return result;
}
