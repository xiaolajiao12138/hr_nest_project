import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AgentSchemaInspector } from './agent-schema.inspector';
import { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

/**
 * 构造贴近真实 TypeORM DataSource 的模拟元数据与事务执行器
 */
function createMockDataSource(queryRows: any[] = []) {
  const executedSqls: string[] = [];

  const mockQueryRunner = {
    connect: async () => {},
    startTransaction: async () => {
      executedSqls.push('BEGIN');
    },
    query: async (sql: string, params?: any[]) => {
      executedSqls.push(sql);
      if (sql.startsWith('SET ')) {
        return [];
      }
      return queryRows;
    },
    rollbackTransaction: async () => {
      executedSqls.push('ROLLBACK');
    },
    release: async () => {},
  };

  const mockDataSource: any = {
    executedSqls,
    entityMetadatas: [
      {
        tableName: 'sys_user',
        name: 'User',
        columns: [
          { databaseName: 'id', type: 'int', comment: '主键ID', isSelect: true },
          { databaseName: 'username', type: 'varchar', comment: '登录用户名', isSelect: true },
          { databaseName: 'real_name', type: 'varchar', comment: '真实姓名', isSelect: true },
          { databaseName: 'password', type: 'varchar', comment: '密码散列', isSelect: false },
          { databaseName: 'salt', type: 'varchar', comment: '盐值', isSelect: false },
        ],
        manyToManyRelations: [
          {
            joinTableName: 'sys_user_role',
            joinColumns: [{ databaseName: 'user_id' }],
            inverseJoinColumns: [{ databaseName: 'role_id' }],
          },
        ],
      },
      {
        tableName: 'hr_salary_record',
        name: 'SalaryRecord',
        columns: [
          { databaseName: 'id', type: 'int', comment: '主键ID', isSelect: true },
          { databaseName: 'emp_id', type: 'int', comment: '员工ID', isSelect: true },
          { databaseName: 'net_salary', type: 'numeric', comment: '实发工资', isSelect: true },
          { databaseName: 'payslip_password', type: 'varchar', comment: '工资条口令', isSelect: true },
        ],
        manyToManyRelations: [],
      },
      {
        tableName: 'sys_dept',
        name: 'Dept',
        columns: [
          { databaseName: 'id', type: 'int', comment: '部门ID', isSelect: true },
          { databaseName: 'dept_name', type: 'varchar', comment: '部门名称', isSelect: true },
        ],
        manyToManyRelations: [],
      },
    ],
    createQueryRunner: () => mockQueryRunner,
    query: async () => [{ id: 9, emp_no: 'EMP009', name: '张三' }],
  };

  return mockDataSource;
}

const adminUser: CurrentUserPayload = {
  userId: 1,
  username: 'admin',
  roles: ['admin'],
  permissions: ['*'],
};

const normalEmployee: CurrentUserPayload = {
  userId: 2,
  username: 'EMP009',
  roles: ['employee'],
  permissions: ['hr:leave:add'],
};

describe('AgentSchemaInspector 动态表结构与只读安全查询引擎', () => {
  it('自动提取实体表与多对多中间表，并彻底隐藏 password/salt 等敏感字段', () => {
    const ds = createMockDataSource();
    const inspector = new AgentSchemaInspector(ds);

    const schemaPrompt = inspector.buildAuthorizedSchemaPrompt(adminUser);

    assert.match(schemaPrompt, /sys_user/);
    assert.match(schemaPrompt, /sys_user_role/);
    assert.match(schemaPrompt, /user_id/);
    assert.match(schemaPrompt, /hr_salary_record/);
    assert.doesNotMatch(schemaPrompt, /\bpassword\b/);
    assert.doesNotMatch(schemaPrompt, /\bsalt\b/);
    assert.doesNotMatch(schemaPrompt, /payslip_password/);
  });

  it('拦截非 SELECT 写操作、多语句注入以及系统敏感目录查询', async () => {
    const ds = createMockDataSource();
    const inspector = new AgentSchemaInspector(ds);

    const deleteRes = await inspector.executeReadOnlyQuery(
      'DELETE FROM sys_user WHERE id = 1',
      adminUser,
    );
    assert.equal(deleteRes.success, false);

    const multiRes = await inspector.executeReadOnlyQuery(
      'SELECT * FROM sys_dept; DROP TABLE sys_dept;',
      adminUser,
    );
    assert.equal(multiRes.success, false);

    const sysCatalogRes = await inspector.executeReadOnlyQuery(
      'SELECT * FROM pg_shadow',
      adminUser,
    );
    assert.equal(sysCatalogRes.success, false);
  });

  it('普通员工无薪酬列表权限时，查询他人薪酬记录会被行级/表级权限硬拦截', async () => {
    const ds = createMockDataSource([
      { id: 1, emp_id: 999, net_salary: '35000.00' }, // emp_id=999 非当前员工(emp_id=9)
    ]);
    const inspector = new AgentSchemaInspector(ds);

    const res = await inspector.executeReadOnlyQuery(
      'SELECT id, emp_id, net_salary FROM hr_salary_record',
      normalEmployee,
    );
    assert.equal(res.success, false);
    assert.match(res.resultSummary, /权限/);
  });

  it('合法只读查询强制在 READ ONLY 事务与 LIMIT 保护下运行，并对返回行敏感键二次脱敏', async () => {
    const ds = createMockDataSource([
      { id: 1, dept_name: '研发中心', payslip_password: 'secret_hash_value' },
    ]);
    const inspector = new AgentSchemaInspector(ds);

    const res = await inspector.executeReadOnlyQuery(
      'SELECT * FROM sys_dept',
      normalEmployee,
    );

    assert.equal(res.success, true);
    assert.ok(
      ds.executedSqls.some((s: string) => s.includes('SET TRANSACTION READ ONLY')),
    );
    assert.ok(ds.executedSqls.some((s: string) => /LIMIT\s+50/i.test(s)));
    assert.equal(res.data.rows[0].dept_name, '研发中心');
    assert.equal('payslip_password' in res.data.rows[0], false);
  });
});
