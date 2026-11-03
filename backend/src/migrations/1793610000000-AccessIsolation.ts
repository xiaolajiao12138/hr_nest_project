import { MigrationInterface, QueryRunner } from 'typeorm';
export class AccessIsolation1793610000000 implements MigrationInterface {
    async up(query: QueryRunner): Promise<void> {
        await query.query(`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS employee_id integer;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_employee ON sys_user(employee_id);
      ALTER TABLE sys_role ADD COLUMN IF NOT EXISTS data_scope varchar(30) NOT NULL DEFAULT 'SELF';
      ALTER TABLE sys_role ADD COLUMN IF NOT EXISTS scope_dept_ids jsonb NOT NULL DEFAULT '[]'::jsonb;`);
        await query.query("ALTER TABLE sys_role ALTER COLUMN data_scope SET DEFAULT 'SELF'");
        await query.query('ALTER TABLE sys_file ADD COLUMN IF NOT EXISTS owner_user_id integer');
        // 仅工号与登录名完全一致且没有冲突时迁移；不按可编辑姓名/手机推断授权身份。
        await query.query(`UPDATE sys_user u SET employee_id = e.id FROM hr_employee e
      WHERE u.employee_id IS NULL AND u.username = e.emp_no
      AND NOT EXISTS (SELECT 1 FROM sys_user other WHERE other.employee_id = e.id)`);
        await query.query(`UPDATE sys_user u SET dept_id=e.dept_id FROM hr_employee e WHERE u.employee_id=e.id AND u.dept_id IS DISTINCT FROM e.dept_id`);
    await query.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_employee_binding' AND conrelid = 'sys_user'::regclass) THEN
      ALTER TABLE sys_user ADD CONSTRAINT fk_user_employee_binding FOREIGN KEY(employee_id) REFERENCES hr_employee(id) ON DELETE SET NULL;
      END IF; END $$;`);
        await query.query(`UPDATE sys_user u SET avatar='/api/upload/avatar/'||f.id FROM sys_file f
      WHERE f.file_path LIKE 'avatar/%' AND split_part(u.avatar,'?',1)='/api/upload/preview/'||f.file_path`);
        // Existing duplicate business records require explicit reconciliation; never delete payroll/history automatically.
        await query.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_employee_month ON hr_salary_record(emp_id, year_month);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_annual_employee_year ON hr_annual(emp_id, year);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_performance_employee_plan ON hr_performance_record(emp_id, plan_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_employee_date ON hr_attendance_record(emp_id, date);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_employee_date ON hr_attendance_schedule(emp_id, date);`);
        const actions = {
            'hr:dept': ['add', 'edit', 'delete'], 'system:menu': ['add', 'edit', 'delete'],
            'ops:dict': ['add', 'edit', 'delete'], 'ops:notice': ['add', 'edit', 'delete', 'publish'],
            'ops:log': ['clean'], 'hr:employee': ['sensitive'], 'hr:salary': ['sync'],
            'system:user': ['assign'], 'hr:attendance': ['approveRepair'], 'hr:performance': ['manager'],
        };
        for (const [prefix, commands] of Object.entries(actions)) {
            for (const command of commands) {
                await query.query(`INSERT INTO sys_menu(parent_id, title, name, path, component, icon, sort, menu_type, perms, is_frame, is_hidden, status)
          SELECT parent.id, $2::varchar, '', '', '', '', 99, 'F', $1::varchar, false, false, 1 FROM sys_menu parent
          WHERE parent.perms = $3::varchar AND parent.menu_type = 'C'
          AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE perms = $1::varchar) LIMIT 1`, [`${prefix}:${command}`, ({ add: '新增', edit: '编辑', delete: '删除', publish: '发布', clean: '清空', sensitive: '查看敏感档案', sync: '同步绩效到薪资', assign: '账号授权', approveRepair: '修正考勤', manager: '主管评分' } as Record<string, string>)[command], `${prefix}:list`]);
            }
        }
    }
    async down(): Promise<void> {
        // 身份绑定和授权配置涉及真实业务数据，回滚不自动删除。
    }
}
