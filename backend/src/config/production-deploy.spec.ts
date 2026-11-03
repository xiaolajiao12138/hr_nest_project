import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 生产环境 Docker Compose 发布就绪度校验测试
 * 覆盖：
 * 1. docker/init.sql 全量初始化表结构（含 AI 会话表与数据范围隔离字段）
 * 2. docker-compose.yml 大模型环境变量透传映射
 * 3. 存量线上库平滑升级的幂等 TypeORM 迁移与 AppModule 自动执行配置
 */
describe('生产环境部署配置与数据库迁移就绪度校验', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const backendRoot = path.resolve(__dirname, '../..');

  it('docker/init.sql 应包含最新 AI 会话表与数据范围隔离字段定义', () => {
    const initSqlPath = path.join(projectRoot, 'docker', 'init.sql');
    const sql = fs.readFileSync(initSqlPath, 'utf8');

    assert.match(sql, /CREATE TABLE\s+sys_agent_session/i, '缺少 sys_agent_session 建表语句');
    assert.match(sql, /CREATE TABLE\s+sys_agent_message/i, '缺少 sys_agent_message 建表语句');
    assert.match(sql, /employee_id\s+INT/i, 'sys_user 缺少 employee_id 字段');
    assert.match(sql, /data_scope\s+VARCHAR/i, 'sys_role 缺少 data_scope 字段');
    assert.match(sql, /scope_dept_ids\s+JSONB/i, 'sys_role 缺少 scope_dept_ids 字段');
    assert.match(sql, /owner_user_id\s+INT/i, 'sys_file 缺少 owner_user_id 字段');
    assert.match(sql, /hr:employee:sensitive/, 'sys_menu 缺少细粒度敏感档案权限初始化');
    assert.match(sql, /system:user:assign/, 'sys_menu 缺少账号授权权限初始化');
  });

  it('docker-compose.yml 应在 backend 容器中透传 LLM 大模型环境变量', () => {
    const composePath = path.join(projectRoot, 'docker-compose.yml');
    const compose = fs.readFileSync(composePath, 'utf8');

    assert.match(compose, /LLM_API_KEY:\s*\$\{LLM_API_KEY:-/, '缺少 LLM_API_KEY 映射');
    assert.match(compose, /LLM_BASE_URL:\s*\$\{LLM_BASE_URL:-/, '缺少 LLM_BASE_URL 映射');
    assert.match(compose, /LLM_MODEL:\s*\$\{LLM_MODEL:-/, '缺少 LLM_MODEL 映射');
  });

  it('应提供幂等的 AI 会话持久化迁移脚本并在 AppModule 生产模式下自动执行', async () => {
    const migrationFile = path.join(
      backendRoot,
      'src',
      'migrations',
      '1793680000000-AgentSessionPersistence.ts',
    );
    assert.equal(fs.existsSync(migrationFile), true, '缺少 1793680000000-AgentSessionPersistence.ts 迁移文件');

    // 动态加载并验证迁移 SQL 的幂等性（IF NOT EXISTS）
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(migrationFile);
    const MigrationCls = mod.AgentSessionPersistence1793680000000;
    assert.equal(typeof MigrationCls, 'function', '未导出 AgentSessionPersistence1793680000000 类');

    const executedSqls: string[] = [];
    const instance = new MigrationCls();
    await instance.up({
      query: async (sql: string) => {
        executedSqls.push(sql);
      },
    });

    const joined = executedSqls.join('\n');
    assert.match(joined, /CREATE TABLE IF NOT EXISTS sys_agent_session/i);
    assert.match(joined, /CREATE TABLE IF NOT EXISTS sys_agent_message/i);

    const appModuleSource = fs.readFileSync(
      path.join(backendRoot, 'src', 'app.module.ts'),
      'utf8',
    );
    assert.match(appModuleSource, /migrationsRun:\s*!dbConf\.synchronize/);
    assert.match(appModuleSource, /AgentSessionPersistence1793680000000/);
  });
});
