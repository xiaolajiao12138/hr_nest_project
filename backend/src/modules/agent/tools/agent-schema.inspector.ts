import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * 统一工具执行返回结构
 */
export interface AgentToolResult {
  success: boolean;
  title: string;
  resultSummary: string;
  data: any;
}

interface TableColumnMeta {
  name: string;
  type: string;
  comment: string;
}

interface TableSchemaMeta {
  tableName: string;
  columns: TableColumnMeta[];
  isJoinTable?: boolean;
}

/**
 * 敏感字段名匹配正则（物理屏蔽，永不暴露给大模型或前端）
 */
const SENSITIVE_COLUMN_REGEX = /(password|salt|secret|token)/i;

/**
 * 危险 SQL 关键字与系统敏感视图黑名单
 */
const FORBIDDEN_SQL_REGEX =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PREPARE|VACUUM|ANALYZE|LOCK|COMMENT|PG_SLEEP|PG_READ_FILE|PG_LS_DIR|LO_IMPORT|LO_EXPORT|PG_SHADOW|PG_AUTHID|PG_ROLES|PG_USER|PG_STAT_ACTIVITY|INFORMATION_SCHEMA)\b/i;

/**
 * 动态数据模型感知与安全只读查询引擎
 *
 * 核心职责：
 * 1. 自动从 TypeORM DataSource 提取全系统表结构、真实列名、中文注释与多对多连接表；
 * 2. 自动剔除密码、盐值、工资条口令等高敏字段；
 * 3. 在 PostgreSQL READ ONLY 只读事务与超时保护下执行 SELECT 查询；
 * 4. 实施表级 RBAC 权限校验与个人隐私表（薪酬、考勤、请假、绩效）行级本人隔离。
 */
@Injectable()
export class AgentSchemaInspector {
  private readonly logger = new Logger(AgentSchemaInspector.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * 判断用户是否为系统超级管理员
   */
  private isAdmin(user: CurrentUserPayload): boolean {
    return Boolean(
      user.roles?.includes('admin') || user.permissions?.includes('*'),
    );
  }

  /**
   * 判断用户是否持有任一指定权限码
   */
  private hasAnyPermission(
    user: CurrentUserPayload,
    perms: string[],
  ): boolean {
    if (this.isAdmin(user)) return true;
    const userPerms = user.permissions || [];
    return perms.some((p) => userPerms.includes(p));
  }

  /**
   * 自动收集所有实体表与多对多中间连接表结构（自动过滤敏感列）
   */
  collectTableSchemas(user: CurrentUserPayload): TableSchemaMeta[] {
    const schemas = new Map<string, TableSchemaMeta>();
    const canViewLogs = this.hasAnyPermission(user, ['system:log:list']);

    for (const meta of this.dataSource.entityMetadatas || []) {
      const tableName = meta.tableName;
      if (!tableName) continue;

      // 默认隐藏底层附件表；无日志权限时隐藏日志大表
      if (tableName === 'sys_file') continue;
      if (
        (tableName === 'sys_oper_log' || tableName === 'sys_login_log') &&
        !canViewLogs
      ) {
        continue;
      }

      const columns: TableColumnMeta[] = (meta.columns || [])
        .filter(
          (col) =>
            col.isSelect !== false &&
            !SENSITIVE_COLUMN_REGEX.test(col.databaseName),
        )
        .map((col) => ({
          name: col.databaseName,
          type:
            typeof col.type === 'function'
              ? col.type.name.toLowerCase()
              : String(col.type),
          comment: col.comment || '',
        }));

      schemas.set(tableName, { tableName, columns });

      // 自动提取多对多中间关联表（如 sys_user_role、sys_role_menu）
      for (const rel of meta.manyToManyRelations || []) {
        const joinTable = rel.joinTableName;
        if (!joinTable || schemas.has(joinTable)) continue;

        const joinCols: TableColumnMeta[] = [
          ...(rel.joinColumns || []).map((c) => ({
            name: c.databaseName,
            type: 'int',
            comment: '关联外键ID',
          })),
          ...(rel.inverseJoinColumns || []).map((c) => ({
            name: c.databaseName,
            type: 'int',
            comment: '关联目标外键ID',
          })),
        ];
        if (joinCols.length > 0) {
          schemas.set(joinTable, {
            tableName: joinTable,
            columns: joinCols,
            isJoinTable: true,
          });
        }
      }
    }

    return Array.from(schemas.values());
  }

  /**
   * 构建注入给大模型的精简表结构说明文本
   */
  buildAuthorizedSchemaPrompt(user: CurrentUserPayload): string {
    const tables = this.collectTableSchemas(user);
    if (tables.length === 0) {
      return '当前暂无已注册的数据表元数据。';
    }

    const lines = tables.map((t) => {
      const colsDesc = t.columns
        .map((c) => (c.comment ? `${c.name}(${c.comment})` : c.name))
        .join(', ');
      return `- ${t.tableName}: [${colsDesc}]`;
    });

    const scopeNote = this.isAdmin(user)
      ? '您具备管理员数据视野，可跨表自由关联查询全公司数据。'
      : '若无对应模块全量列表权限，查询薪酬(hr_salary_record)、请假(hr_leave)、考勤(hr_attendance_*)、绩效(hr_performance_*)时必须在 WHERE 中限定本人 emp_id（并必须在 SELECT 中包含 emp_id 列以便系统核验归属）。';

    return `${scopeNote}\n${lines.join('\n')}`;
  }

  /**
   * 解析当前登录账号关联的员工档案主键 ID（emp_id）
   */
  async resolveCurrentEmployeeId(
    user: CurrentUserPayload,
  ): Promise<number | null> {
    try {
      const rows = await this.dataSource.query(
        `SELECT e.id FROM hr_employee e
         LEFT JOIN sys_user u ON u.id = $1
         WHERE e.emp_no = $2 OR (u.real_name IS NOT NULL AND e.name = u.real_name) OR (u.phone IS NOT NULL AND e.phone = u.phone)
         LIMIT 1`,
        [user.userId, user.username],
      );
      return rows?.[0]?.id ? Number(rows[0].id) : null;
    } catch {
      return null;
    }
  }

  /**
   * 判定指定表对当前用户的访问策略：
   * - 'allow': 允许查询全表
   * - 'self_only': 仅允许查询当前员工本人记录（必须带 emp_id 且等于本人）
   * - 'deny': 禁止访问
   */
  private getTableAccessPolicy(
    tableName: string,
    user: CurrentUserPayload,
    allowedSchemaTables: Set<string>,
  ): 'allow' | 'self_only' | 'deny' {
    const lower = tableName.toLowerCase();
    if (!allowedSchemaTables.has(lower)) {
      return 'deny';
    }
    if (this.isAdmin(user)) {
      return 'allow';
    }

    if (lower.startsWith('hr_salary')) {
      return this.hasAnyPermission(user, ['hr:salary:list'])
        ? 'allow'
        : 'self_only';
    }
    if (lower === 'hr_leave' || lower === 'hr_annual_leave') {
      return this.hasAnyPermission(user, ['hr:leave:list'])
        ? 'allow'
        : 'self_only';
    }
    if (
      lower === 'hr_attendance_record' ||
      lower === 'hr_attendance_schedule'
    ) {
      return this.hasAnyPermission(user, ['hr:attendance:list'])
        ? 'allow'
        : 'self_only';
    }
    if (lower.startsWith('hr_performance')) {
      return this.hasAnyPermission(user, ['hr:performance:list'])
        ? 'allow'
        : 'self_only';
    }

    return 'allow';
  }

  /**
   * 提取 SQL 中 FROM / JOIN 引用的真实表名（排除 WITH CTE 临时别名）
   */
  private extractReferencedTables(sql: string): string[] {
    const cteNames = new Set<string>();
    const cteRegex = /\bWITH\s+(?:RECURSIVE\s+)?([a-zA-Z0-9_]+)\s+AS\s*\(/gi;
    let cteMatch: RegExpExecArray | null;
    while ((cteMatch = cteRegex.exec(sql)) !== null) {
      cteNames.add(cteMatch[1].toLowerCase());
    }

    const additionalCteRegex = /,\s*([a-zA-Z0-9_]+)\s+AS\s*\(/gi;
    while ((cteMatch = additionalCteRegex.exec(sql)) !== null) {
      cteNames.add(cteMatch[1].toLowerCase());
    }

    const tables = new Set<string>();
    const tableRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_."]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(sql)) !== null) {
      const raw = match[1].replace(/"/g, '').trim();
      if (!raw || raw.startsWith('(')) continue;
      const parts = raw.split('.');
      const tableName = parts[parts.length - 1].toLowerCase();
      if (!cteNames.has(tableName)) {
        tables.add(tableName);
      }
    }
    return Array.from(tables);
  }

  /**
   * 执行安全只读 SQL 查询
   */
  async executeReadOnlyQuery(
    rawSql: string,
    user: CurrentUserPayload,
    purpose?: string,
  ): Promise<AgentToolResult> {
    const title = purpose ? `数据查询：${purpose}` : '系统数据只读查询';
    const sql = (rawSql || '').trim().replace(/;+\s*$/, '');

    if (!sql) {
      return {
        success: false,
        title,
        resultSummary: '查询语句不能为空',
        data: { error: 'EMPTY_SQL' },
      };
    }

    // 1. 阻断多语句、注释绕过与非 SELECT 语句
    if (sql.includes(';') || sql.includes('--') || sql.includes('/*')) {
      return {
        success: false,
        title,
        resultSummary: '安全拦截：仅支持单条标准 SELECT 查询，禁止多语句或注释符',
        data: { error: 'UNSAFE_SQL_SYNTAX' },
      };
    }

    if (!/^(SELECT|WITH)\b/i.test(sql) || FORBIDDEN_SQL_REGEX.test(sql)) {
      return {
        success: false,
        title,
        resultSummary: '安全拦截：查询引擎仅允许执行纯只读 SELECT 查询',
        data: { error: 'FORBIDDEN_SQL_OPERATION' },
      };
    }

    // 2. 校验引用的表名白名单与 RBAC 表级/行级策略
    const allowedSchemas = this.collectTableSchemas(user);
    const allowedSet = new Set(
      allowedSchemas.map((s) => s.tableName.toLowerCase()),
    );
    const referencedTables = this.extractReferencedTables(sql);

    if (referencedTables.length === 0) {
      return {
        success: false,
        title,
        resultSummary: '查询语句必须明确指定有效的数据表',
        data: { error: 'NO_TABLE_SPECIFIED' },
      };
    }

    let requiresSelfCheck = false;
    for (const tbl of referencedTables) {
      const policy = this.getTableAccessPolicy(tbl, user, allowedSet);
      if (policy === 'deny') {
        return {
          success: false,
          title,
          resultSummary: `权限不足或表不存在：当前账号无权查询数据表 [${tbl}]`,
          data: { error: 'TABLE_ACCESS_DENIED', table: tbl },
        };
      }
      if (policy === 'self_only') {
        requiresSelfCheck = true;
      }
    }

    const myEmpId = requiresSelfCheck
      ? await this.resolveCurrentEmployeeId(user)
      : null;

    if (requiresSelfCheck && !myEmpId) {
      return {
        success: false,
        title,
        resultSummary:
          '权限受限：当前账号无全员列表查看权限，且未关联个人员工档案，无法查看该敏感业务表',
        data: { error: 'SELF_EMPLOYEE_NOT_BOUND' },
      };
    }

    // 3. 在 PostgreSQL 只读事务与 5s 超时保护下执行，强制最多返回 50 行
    const wrappedSql = `SELECT * FROM (${sql}) AS _agent_readonly_q LIMIT 50`;
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query('SET TRANSACTION READ ONLY');
      await queryRunner.query("SET LOCAL statement_timeout = '5000'");

      const rawRows: Record<string, any>[] = await queryRunner.query(wrappedSql);
      await queryRunner.rollbackTransaction();

      const canViewAllEmployees = this.hasAnyPermission(user, [
        'hr:employee:list',
      ]);
      const touchedEmployeeTable = referencedTables.includes('hr_employee');

      // 4. 行级本人归属硬核验与敏感字段二次脱敏
      const sanitizedRows: Record<string, any>[] = [];
      for (const row of rawRows || []) {
        if (requiresSelfCheck) {
          const rowEmpId = Number(row.emp_id ?? row.empId ?? row.employee_id);
          if (!rowEmpId || rowEmpId !== myEmpId) {
            return {
              success: false,
              title,
              resultSummary: `权限拦截：您仅可查询本人（emp_id=${myEmpId}）的记录，无权查看他人敏感数据（请在 WHERE 中限定 emp_id = ${myEmpId} 并在 SELECT 中保留 emp_id 列）`,
              data: { error: 'ROW_SCOPE_FORBIDDEN', allowedEmpId: myEmpId },
            };
          }
        }

        const cleanRow: Record<string, any> = {};
        const isSelfEmployeeRow =
          myEmpId && Number(row.id) === myEmpId && touchedEmployeeTable;

        for (const [key, val] of Object.entries(row)) {
          if (SENSITIVE_COLUMN_REGEX.test(key)) {
            continue;
          }
          // 非人事管理员在联查 hr_employee 时，自动抹除他人底薪与身份证号
          if (
            touchedEmployeeTable &&
            !canViewAllEmployees &&
            !isSelfEmployeeRow &&
            /^(salary|base_salary|id_card|idcard)$/i.test(key)
          ) {
            continue;
          }
          cleanRow[key] = val;
        }
        sanitizedRows.push(cleanRow);
      }

      return {
        success: true,
        title,
        resultSummary: `查询成功，返回 ${sanitizedRows.length} 条记录`,
        data: {
          count: sanitizedRows.length,
          rows: sanitizedRows,
        },
      };
    } catch (err: any) {
      try {
        await queryRunner.rollbackTransaction();
      } catch {
        // 忽略回滚异常
      }
      this.logger.warn(
        `[AI 只读查询失败] 用户: ${user.username}, SQL: ${sql}, 错误: ${err.message}`,
      );
      return {
        success: false,
        title,
        resultSummary: `SQL 执行异常: ${err.message}`,
        data: {
          error: 'SQL_EXECUTION_ERROR',
          message: err.message,
          hint: '请核对表名与字段名是否与提供的 Schema 完全一致后重试',
        },
      };
    } finally {
      await queryRunner.release();
    }
  }
}
