-- ========================================================
-- 企业级HR人事后台管理系统 数据库初始化脚本
-- 数据库类型: PostgreSQL 16
-- 编码: UTF-8
-- ========================================================

-- 1. 创建部门表 (sys_dept)
DROP TABLE IF EXISTS sys_dept CASCADE;
CREATE TABLE sys_dept (
    id SERIAL PRIMARY KEY,
    parent_id INT DEFAULT 0,
    dept_name VARCHAR(50) NOT NULL,
    leader VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(50),
    sort INT DEFAULT 0,
    status SMALLINT DEFAULT 1, -- 1: 正常, 0: 停用
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_dept IS '部门表';
COMMENT ON COLUMN sys_dept.parent_id IS '父部门ID';
COMMENT ON COLUMN sys_dept.dept_name IS '部门名称';
COMMENT ON COLUMN sys_dept.status IS '状态 1启用 0停用';

-- 2. 创建用户表 (sys_user)
DROP TABLE IF EXISTS sys_user CASCADE;
CREATE TABLE sys_user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    salt VARCHAR(50) DEFAULT '',
    real_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(50),
    avatar VARCHAR(255) DEFAULT '',
    dept_id INT REFERENCES sys_dept(id) ON DELETE SET NULL,
    status SMALLINT DEFAULT 1, -- 1: 正常, 0: 停用
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_user IS '系统用户表';
COMMENT ON COLUMN sys_user.username IS '登录账号';
COMMENT ON COLUMN sys_user.password IS 'BCrypt加密密码';
COMMENT ON COLUMN sys_user.status IS '状态 1正常 0停用';

-- 3. 创建角色表 (sys_role)
DROP TABLE IF EXISTS sys_role CASCADE;
CREATE TABLE sys_role (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    role_key VARCHAR(50) NOT NULL UNIQUE,
    sort INT DEFAULT 0,
    status SMALLINT DEFAULT 1, -- 1: 正常, 0: 停用
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_role IS '系统角色表';
COMMENT ON COLUMN sys_role.role_key IS '角色标识如 admin, hr';

-- 4. 创建菜单路由表 (sys_menu)
DROP TABLE IF EXISTS sys_menu CASCADE;
CREATE TABLE sys_menu (
    id SERIAL PRIMARY KEY,
    parent_id INT DEFAULT 0,
    title VARCHAR(50) NOT NULL,
    name VARCHAR(50),             -- 路由名称（用于Vue-Router命名路由与Keep-Alive缓存）
    path VARCHAR(100) NOT NULL,   -- 路由路径
    component VARCHAR(150),       -- 组件路径或组件名，目录一般为 Layout
    icon VARCHAR(50) DEFAULT '',  -- 菜单图标
    sort INT DEFAULT 0,
    menu_type CHAR(1) DEFAULT 'C',-- M: 目录, C: 菜单, F: 按钮权限
    perms VARCHAR(100),           -- 权限标识，如 system:user:add
    is_frame BOOLEAN DEFAULT FALSE,
    is_hidden BOOLEAN DEFAULT FALSE,
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_menu IS '动态菜单及路由权限表';
COMMENT ON COLUMN sys_menu.component IS '前端组件路径(views/xxx)或Layout';
COMMENT ON COLUMN sys_menu.menu_type IS '类型: M-目录, C-菜单, F-按钮';
COMMENT ON COLUMN sys_menu.perms IS '按钮权限字符';

-- 5. 用户与角色关联表 (sys_user_role)
DROP TABLE IF EXISTS sys_user_role CASCADE;
CREATE TABLE sys_user_role (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES sys_user(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES sys_role(id) ON DELETE CASCADE,
    UNIQUE (user_id, role_id)
);

-- 6. 角色与菜单关联表 (sys_role_menu)
DROP TABLE IF EXISTS sys_role_menu CASCADE;
CREATE TABLE sys_role_menu (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES sys_role(id) ON DELETE CASCADE,
    menu_id INT NOT NULL REFERENCES sys_menu(id) ON DELETE CASCADE,
    UNIQUE (role_id, menu_id)
);

-- 7. 字典数据表 (sys_dict)
DROP TABLE IF EXISTS sys_dict CASCADE;
CREATE TABLE sys_dict (
    id SERIAL PRIMARY KEY,
    dict_name VARCHAR(50) NOT NULL,
    dict_type VARCHAR(50) NOT NULL,
    dict_label VARCHAR(50) NOT NULL,
    dict_value VARCHAR(50) NOT NULL,
    sort INT DEFAULT 0,
    status SMALLINT DEFAULT 1,
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_dict IS '字典数据表';

-- 8. 文件资源表 (sys_file)
DROP TABLE IF EXISTS sys_file CASCADE;
CREATE TABLE sys_file (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_ext VARCHAR(20) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    bucket_name VARCHAR(50) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_file IS '对象存储文件资源表';

-- 9. 员工档案表 (hr_employee)
DROP TABLE IF EXISTS hr_employee CASCADE;
CREATE TABLE hr_employee (
    id SERIAL PRIMARY KEY,
    emp_no VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    gender VARCHAR(10) DEFAULT '男',
    phone VARCHAR(20) NOT NULL,
    id_card VARCHAR(30) NOT NULL,
    id_card_front_id INT REFERENCES sys_file(id) ON DELETE SET NULL,
    id_card_back_id INT REFERENCES sys_file(id) ON DELETE SET NULL,
    edu_cert_id INT REFERENCES sys_file(id) ON DELETE SET NULL,
    entry_date DATE NOT NULL,
    post VARCHAR(50) NOT NULL,
    dept_id INT REFERENCES sys_dept(id) ON DELETE RESTRICT,
    education VARCHAR(20) DEFAULT '本科',
    salary NUMERIC(12, 2) DEFAULT 0.00,
    status SMALLINT DEFAULT 1, -- 1: 在职, 2: 离职, 3: 试用期
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE hr_employee IS '员工档案表';

-- 10. 年假余额表 (hr_annual)
DROP TABLE IF EXISTS hr_annual CASCADE;
CREATE TABLE hr_annual (
    id SERIAL PRIMARY KEY,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    year INT NOT NULL,
    total_days NUMERIC(4, 1) DEFAULT 5.0,
    used_days NUMERIC(4, 1) DEFAULT 0.0,
    remain_days NUMERIC(4, 1) DEFAULT 5.0,
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (emp_id, year)
);

COMMENT ON TABLE hr_annual IS '员工年假余额表';

-- 11. 请假单表 (hr_leave)
DROP TABLE IF EXISTS hr_leave CASCADE;
CREATE TABLE hr_leave (
    id SERIAL PRIMARY KEY,
    leave_no VARCHAR(50) NOT NULL UNIQUE,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    emp_name VARCHAR(50) NOT NULL,
    dept_id INT REFERENCES sys_dept(id) ON DELETE SET NULL,
    leave_type VARCHAR(20) NOT NULL, -- ANNUAL: 年假, SICK: 病假, CASUAL: 事假
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    days NUMERIC(4, 1) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING: 待审批, APPROVED: 审批通过, REJECTED: 已驳回
    audit_user_id INT REFERENCES sys_user(id) ON DELETE SET NULL,
    audit_remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE hr_leave IS '员工请假单记录表';

-- 12. 系统公告表 (sys_notice)
DROP TABLE IF EXISTS sys_notice CASCADE;
CREATE TABLE sys_notice (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    notice_type VARCHAR(20) DEFAULT 'NOTICE', -- NOTICE: 通知, ANNOUNCEMENT: 公告
    file_id INT REFERENCES sys_file(id) ON DELETE SET NULL,
    status SMALLINT DEFAULT 1, -- 1: 正常发布, 0: 下架
    created_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_notice IS '系统公告表';

-- 13. 系统操作日志表 (sys_oper_log)
DROP TABLE IF EXISTS sys_oper_log CASCADE;
CREATE TABLE sys_oper_log (
    id SERIAL PRIMARY KEY,
    title VARCHAR(50),
    business_type VARCHAR(50),
    method VARCHAR(150),
    request_method VARCHAR(20),
    oper_name VARCHAR(50),
    oper_url VARCHAR(255),
    oper_ip VARCHAR(50),
    oper_param TEXT,
    json_result TEXT,
    status SMALLINT DEFAULT 1, -- 1: 正常, 0: 异常
    error_msg TEXT,
    cost_time BIGINT,
    oper_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sys_oper_log IS '操作日志表';

-- 14. 员工月度薪酬核算表 (hr_salary_record)
DROP TABLE IF EXISTS hr_salary_record CASCADE;
CREATE TABLE hr_salary_record (
    id SERIAL PRIMARY KEY,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    year_month VARCHAR(10) NOT NULL,
    base_salary NUMERIC(12, 2) DEFAULT 0.00,
    post_salary NUMERIC(12, 2) DEFAULT 0.00,
    performance_salary NUMERIC(12, 2) DEFAULT 0.00,
    overtime_salary NUMERIC(12, 2) DEFAULT 0.00,
    allowance NUMERIC(12, 2) DEFAULT 0.00,
    leave_deduction NUMERIC(12, 2) DEFAULT 0.00,
    social_security NUMERIC(12, 2) DEFAULT 0.00,
    housing_fund NUMERIC(12, 2) DEFAULT 0.00,
    tax NUMERIC(12, 2) DEFAULT 0.00,
    gross_salary NUMERIC(12, 2) DEFAULT 0.00,
    net_salary NUMERIC(12, 2) DEFAULT 0.00,
    status SMALLINT DEFAULT 1, -- 1: 核算草稿, 2: 核准待发, 3: 已发放
    payslip_password VARCHAR(128),
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (emp_id, year_month)
);
COMMENT ON TABLE hr_salary_record IS '员工月度薪酬核算与发薪记录表';

-- 15. 考勤班次规则配置表 (hr_attendance_shift)
DROP TABLE IF EXISTS hr_attendance_shift CASCADE;
CREATE TABLE hr_attendance_shift (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    late_tolerance INT DEFAULT 10,
    early_tolerance INT DEFAULT 0,
    work_hours NUMERIC(4, 1) DEFAULT 8.0,
    is_default BOOLEAN DEFAULT FALSE,
    status SMALLINT DEFAULT 1,
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE hr_attendance_shift IS '考勤班次规则配置表';

-- 16. 员工考勤排班表 (hr_attendance_schedule)
DROP TABLE IF EXISTS hr_attendance_schedule CASCADE;
CREATE TABLE hr_attendance_schedule (
    id SERIAL PRIMARY KEY,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift_id INT REFERENCES hr_attendance_shift(id) ON DELETE SET NULL,
    is_rest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (emp_id, date)
);
COMMENT ON TABLE hr_attendance_schedule IS '员工考勤排班记录表';

-- 17. 考勤打卡明细与综合判定表 (hr_attendance_record)
DROP TABLE IF EXISTS hr_attendance_record CASCADE;
CREATE TABLE hr_attendance_record (
    id SERIAL PRIMARY KEY,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    shift_id INT REFERENCES hr_attendance_shift(id) ON DELETE SET NULL,
    check_in_status INT DEFAULT 3, -- 1: 正常, 2: 迟到, 3: 缺卡
    check_out_status INT DEFAULT 3, -- 1: 正常, 2: 早退, 3: 缺卡
    status INT DEFAULT 4, -- 1: 正常, 2: 迟到, 3: 早退, 4: 旷工/严重缺卡, 5: 请假中, 6: 休息
    work_hours NUMERIC(4, 1) DEFAULT 0.0,
    check_in_ip VARCHAR(50),
    check_out_ip VARCHAR(50),
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (emp_id, date)
);
COMMENT ON TABLE hr_attendance_record IS '考勤打卡明细与综合判定表';

-- 18. 绩效考评方案表 (hr_performance_plan)
DROP TABLE IF EXISTS hr_performance_plan CASCADE;
CREATE TABLE hr_performance_plan (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    cycle_type VARCHAR(20) DEFAULT 'QUARTERLY',
    start_date VARCHAR(20) NOT NULL,
    end_date VARCHAR(20) NOT NULL,
    weight_self INT DEFAULT 30,
    weight_manager INT DEFAULT 70,
    metrics TEXT,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS',
    remark VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE hr_performance_plan IS '绩效考评方案与周期规划表';

-- 19. 员工绩效考评明细与闭环评定记录表 (hr_performance_record)
DROP TABLE IF EXISTS hr_performance_record CASCADE;
CREATE TABLE hr_performance_record (
    id SERIAL PRIMARY KEY,
    plan_id INT NOT NULL REFERENCES hr_performance_plan(id) ON DELETE CASCADE,
    emp_id INT NOT NULL REFERENCES hr_employee(id) ON DELETE CASCADE,
    emp_name VARCHAR(50) NOT NULL,
    emp_no VARCHAR(50) NOT NULL,
    dept_id INT,
    dept_name VARCHAR(50),
    post VARCHAR(50),
    self_score NUMERIC(5, 1),
    self_comment TEXT,
    manager_score NUMERIC(5, 1),
    manager_comment TEXT,
    final_score NUMERIC(5, 1),
    rating VARCHAR(10),
    coefficient NUMERIC(4, 2) DEFAULT 1.00,
    status VARCHAR(25) DEFAULT 'PENDING_SELF',
    evaluated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE hr_performance_record IS '员工绩效考评明细与闭环评定记录表';

-- ========================================================
-- 初始化基础演示数据
-- ========================================================

-- 初始化部门
INSERT INTO sys_dept (id, parent_id, dept_name, leader, phone, email, sort, status) VALUES
(1, 0, '集团总部', '张董事长', '13800000000', 'ceo@company.com', 1, 1),
(2, 1, '研发中心', '李总监', '13800000001', 'rd@company.com', 2, 1),
(3, 1, '人事行政部', '王经理', '13800000002', 'hr@company.com', 3, 1),
(4, 1, '财务部', '赵总监', '13800000003', 'finance@company.com', 4, 1),
(5, 2, '前端架构组', '陈组长', '13800000004', 'fe@company.com', 1, 1),
(6, 2, '后端架构组', '刘组长', '13800000005', 'be@company.com', 2, 1);

-- 重设部门自增序列
SELECT setval('sys_dept_id_seq', (SELECT MAX(id) FROM sys_dept));

-- 初始化角色
INSERT INTO sys_role (id, role_name, role_key, sort, status, remark) VALUES
(1, '超级管理员', 'admin', 1, 1, '系统最高权限拥有者'),
(2, '人事专员', 'hr', 2, 1, '负责HR人事、员工与请假审批模块');

SELECT setval('sys_role_id_seq', (SELECT MAX(id) FROM sys_role));

-- 初始化用户 (密码全部为: 123456, 采用 bcrypt 加密)
INSERT INTO sys_user (id, username, password, real_name, phone, email, dept_id, status) VALUES
(1, 'admin', '$2a$10$C4au.6EnCKBLQ0mR2alhRua0XwKeDdmdKL8brGGsM/PpiwwX3UQiW', '超级管理员', '13800001001', 'admin@hrsystem.com', 1, 1),
(2, 'hr_user', '$2a$10$C4au.6EnCKBLQ0mR2alhRua0XwKeDdmdKL8brGGsM/PpiwwX3UQiW', '人事主管', '13800001002', 'hr@hrsystem.com', 3, 1);

SELECT setval('sys_user_id_seq', (SELECT MAX(id) FROM sys_user));

-- 分配用户角色
INSERT INTO sys_user_role (user_id, role_id) VALUES
(1, 1),
(2, 2);

-- 初始化动态菜单与路由【重点：前端不写死路由配置，全部保存在此】
INSERT INTO sys_menu (id, parent_id, title, name, path, component, icon, sort, menu_type, perms, is_frame, is_hidden, status) VALUES
-- 1. 仪表盘首页
(1, 0, '工作台', 'Dashboard', '/dashboard', 'views/dashboard/index.vue', 'Odometer', 1, 'C', 'dashboard:view', false, false, 1),

-- 2. 组织与员工管理目录
(2, 0, '人事管理', 'HumanResources', '/hr', 'Layout', 'UserFilled', 2, 'M', '', false, false, 1),
(201, 2, '部门管理', 'DeptManage', '/hr/dept', 'views/hr/dept/index.vue', 'OfficeBuilding', 1, 'C', 'hr:dept:list', false, false, 1),
(202, 2, '员工档案', 'EmployeeManage', '/hr/employee', 'views/hr/employee/index.vue', 'Avatar', 2, 'C', 'hr:employee:list', false, false, 1),
(203, 2, '请假审批', 'LeaveManage', '/hr/leave', 'views/hr/leave/index.vue', 'Tickets', 3, 'C', 'hr:leave:list', false, false, 1),
(204, 2, '薪酬核算', 'SalaryManage', '/hr/salary', 'views/hr/salary/index.vue', 'Money', 4, 'C', 'hr:salary:list', false, false, 1),
(205, 2, '考勤管理', 'AttendanceManage', '/hr/attendance', 'views/hr/attendance/index.vue', 'Calendar', 5, 'C', 'hr:attendance:list', false, false, 1),

-- 员工档案按钮权限
(210, 202, '员工新增', '', '', '', '', 1, 'F', 'hr:employee:add', false, false, 1),
(211, 202, '员工编辑', '', '', '', '', 2, 'F', 'hr:employee:edit', false, false, 1),
(212, 202, '员工删除', '', '', '', '', 3, 'F', 'hr:employee:delete', false, false, 1),
(213, 202, 'Excel导入', '', '', '', '', 4, 'F', 'hr:employee:import', false, false, 1),
(214, 202, 'Excel导出', '', '', '', '', 5, 'F', 'hr:employee:export', false, false, 1),

-- 请假按钮权限
(220, 203, '请假申请', '', '', '', '', 1, 'F', 'hr:leave:add', false, false, 1),
(221, 203, '请假审批', '', '', '', '', 2, 'F', 'hr:leave:audit', false, false, 1),

-- 薪资管理按钮权限
(230, 204, '薪资核算', '', '', '', '', 1, 'F', 'hr:salary:calc', false, false, 1),
(231, 204, '薪资调整', '', '', '', '', 2, 'F', 'hr:salary:edit', false, false, 1),
(232, 204, '发薪确认', '', '', '', '', 3, 'F', 'hr:salary:confirm', false, false, 1),
(233, 204, '薪资导出', '', '', '', '', 4, 'F', 'hr:salary:export', false, false, 1),

-- 考勤管理按钮权限
(240, 205, '在线打卡', '', '', '', '', 1, 'F', 'hr:attendance:clock', false, false, 1),
(241, 205, '排班管理', '', '', '', '', 2, 'F', 'hr:attendance:schedule', false, false, 1),
(242, 205, '班次配置', '', '', '', '', 3, 'F', 'hr:attendance:shift', false, false, 1),
(243, 205, '补卡修正', '', '', '', '', 4, 'F', 'hr:attendance:repair', false, false, 1),

(206, 2, '绩效考评', 'PerformanceManage', '/hr/performance', 'views/hr/performance/index.vue', 'Trophy', 6, 'C', 'hr:performance:list', false, false, 1),

-- 绩效考评按钮权限
(250, 206, '方案发布', '', '', '', '', 1, 'F', 'hr:performance:plan', false, false, 1),
(251, 206, '发起考评', '', '', '', '', 2, 'F', 'hr:performance:start', false, false, 1),
(252, 206, '评审打分', '', '', '', '', 3, 'F', 'hr:performance:eval', false, false, 1),
(253, 206, '绩效归档', '', '', '', '', 4, 'F', 'hr:performance:archive', false, false, 1),
(254, 206, '报表导出', '', '', '', '', 5, 'F', 'hr:performance:export', false, false, 1),

-- 3. 系统权限管理目录
(3, 0, '系统权限', 'SystemManage', '/system', 'Layout', 'Setting', 3, 'M', '', false, false, 1),
(301, 3, '用户管理', 'UserManage', '/system/user', 'views/system/user/index.vue', 'User', 1, 'C', 'system:user:list', false, false, 1),
(302, 3, '角色管理', 'RoleManage', '/system/role', 'views/system/role/index.vue', 'Key', 2, 'C', 'system:role:list', false, false, 1),
(303, 3, '菜单管理', 'MenuManage', '/system/menu', 'views/system/menu/index.vue', 'Menu', 3, 'C', 'system:menu:list', false, false, 1),

-- 用户管理按钮权限
(310, 301, '用户新增', '', '', '', '', 1, 'F', 'system:user:add', false, false, 1),
(311, 301, '用户编辑', '', '', '', '', 2, 'F', 'system:user:edit', false, false, 1),
(312, 301, '用户删除', '', '', '', '', 3, 'F', 'system:user:delete', false, false, 1),
(313, 301, '重置密码', '', '', '', '', 4, 'F', 'system:user:resetPwd', false, false, 1),

-- 4. 系统基础监控目录
(4, 0, '系统运维', 'OpsManage', '/ops', 'Layout', 'Monitor', 4, 'M', '', false, false, 1),
(401, 4, '系统公告', 'NoticeManage', '/ops/notice', 'views/ops/notice/index.vue', 'Bell', 1, 'C', 'ops:notice:list', false, false, 1),
(402, 4, '数据字典', 'DictManage', '/ops/dict', 'views/ops/dict/index.vue', 'Notebook', 2, 'C', 'ops:dict:list', false, false, 1),
(403, 4, '操作日志', 'LogManage', '/ops/log', 'views/ops/log/index.vue', 'Document', 3, 'C', 'ops:log:list', false, false, 1);

SELECT setval('sys_menu_id_seq', (SELECT MAX(id) FROM sys_menu));

-- 超级管理员分配全部菜单权限 (1 ~ 403)
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 1, id FROM sys_menu;

-- 人事专员分配部分权限 (工作台、人事管理及其所有子菜单和按钮、系统公告)
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT 2, id FROM sys_menu WHERE id IN (
    1, 2, 201, 202, 203, 204, 205, 206,
    210, 211, 212, 213, 214,
    220, 221,
    230, 231, 232, 233,
    240, 241, 242, 243,
    250, 251, 252, 253, 254,
    4, 401
);

-- 初始化数据字典
INSERT INTO sys_dict (dict_name, dict_type, dict_label, dict_value, sort, status, remark) VALUES
('请假类型', 'leave_type', '年假', 'ANNUAL', 1, 1, '带薪年休假'),
('请假类型', 'leave_type', '病假', 'SICK', 2, 1, '需提供医疗证明'),
('请假类型', 'leave_type', '事假', 'CASUAL', 3, 1, '非带薪事假'),
('学历类型', 'education_type', '大专', '大专', 1, 1, '专科'),
('学历类型', 'education_type', '本科', '本科', 2, 1, '大学本科'),
('学历类型', 'education_type', '硕士', '硕士', 3, 1, '硕士研究生'),
('学历类型', 'education_type', '博士', '博士', 4, 1, '博士研究生'),
('员工状态', 'employee_status', '在职', '1', 1, 1, '正式员工'),
('员工状态', 'employee_status', '离职', '2', 2, 1, '已办理离职'),
('员工状态', 'employee_status', '试用期', '3', 3, 1, '新入职试用');

-- 初始化演示员工档案
INSERT INTO hr_employee (id, emp_no, name, gender, phone, id_card, entry_date, post, dept_id, education, salary, status, remark) VALUES
(1, 'EMP1001', '张三', '男', '13911112222', '110101199003072331', '2022-03-01', '前端高级工程师', 5, '本科', 18500.00, 1, '技术骨干'),
(2, 'EMP1002', '李四', '女', '13922223333', '110101199205121245', '2023-06-15', 'NestJS后端专家', 6, '硕士', 22000.00, 1, '核心架构师'),
(3, 'EMP1003', '王五', '男', '13933334444', '110101199508203517', '2024-01-10', 'HR人事专员', 3, '本科', 9000.00, 1, '招聘与员工关系');

SELECT setval('hr_employee_id_seq', (SELECT MAX(id) FROM hr_employee));

-- 初始化年假余额 (初始5天，已被使用0天，剩余5天)
INSERT INTO hr_annual (emp_id, year, total_days, used_days, remain_days) VALUES
(1, 2026, 7.0, 0.0, 7.0),
(2, 2026, 5.0, 0.0, 5.0),
(3, 2026, 5.0, 0.0, 5.0);

-- 初始化一条演示请假单
INSERT INTO hr_leave (leave_no, emp_id, emp_name, dept_id, leave_type, start_time, end_time, days, reason, status) VALUES
('LV202610210001', 1, '张三', 5, 'ANNUAL', '2026-10-25 09:00:00+08', '2026-10-26 18:00:00+08', 2.0, '家中有事处理年假休整', 'PENDING');

-- 初始化一条系统公告
INSERT INTO sys_notice (title, content, notice_type, status, created_by) VALUES
('2026年度企业人事管理系统升级通知', '各位同仁好：全新企业级HR人事后台管理系统已正式部署上线，支持动态权限、在线请假审批与档案管理。', 'ANNOUNCEMENT', 1, '超级管理员');

-- 初始化考勤班次规则 (标准常白班)
INSERT INTO hr_attendance_shift (id, name, start_time, end_time, late_tolerance, early_tolerance, work_hours, is_default, status, remark) VALUES
(1, '标准常白班 (09:00-18:00)', '09:00', '18:00', 10, 0, 8.0, true, 1, '全员通用标准工时班次，包含10分钟弹性打卡缓冲');

SELECT setval('hr_attendance_shift_id_seq', (SELECT MAX(id) FROM hr_attendance_shift));

-- 初始化演示薪资记录 (2026-10 包含基础、岗位津贴、绩效)
INSERT INTO hr_salary_record (emp_id, year_month, base_salary, post_salary, performance_salary, overtime_salary, allowance, leave_deduction, social_security, housing_fund, tax, gross_salary, net_salary, status, remark) VALUES
(1, '2026-10', 10000.00, 4500.00, 2220.00, 800.00, 1000.00, 0.00, 1050.00, 700.00, 380.00, 18520.00, 16390.00, 2, '前端架构负责人月度薪资'),
(2, '2026-10', 12000.00, 5500.00, 3300.00, 1200.00, 1000.00, 0.00, 1260.00, 840.00, 620.00, 23000.00, 20280.00, 2, '后端架构专家月度薪资'),
(3, '2026-10', 5000.00, 2200.00, 1000.00, 0.00, 800.00, 0.00, 560.00, 380.00, 80.00, 9000.00, 7980.00, 1, 'HR专员月度薪资');

-- 初始化绩效考评方案与评定记录
INSERT INTO hr_performance_plan (id, title, cycle_type, start_date, end_date, weight_self, weight_manager, metrics, status, remark) VALUES
(1, '2026年Q1研发与运营综合绩效考评', 'QUARTERLY', '2026-01-01', '2026-03-31', 30, 70, '[{"key":"M1","name":"核心交付","type":"KPI","weight":40,"target":"季度重点特性与高可用架构达标率>=98%"},{"key":"M2","name":"业务赋能","type":"KPI","weight":30,"target":"跨部门协作响应及时率与满意度>=95分"},{"key":"M3","name":"技术创新与OKR","type":"OKR","weight":30,"target":"完成技术体系优化演化，产出最佳实践规范"}]', 'IN_PROGRESS', '2026年度第一季度全员KPI/OKR考评闭环'),
(2, '2025年度企业经营与效能年度总评', 'ANNUAL', '2025-01-01', '2025-12-31', 30, 70, '[{"key":"M1","name":"业务指标","type":"KPI","weight":50,"target":"年度业务营收指标与战略目标达成"},{"key":"M2","name":"组织建设","type":"OKR","weight":50,"target":"团队人才梯队搭建与核心知识沉淀"}]', 'COMPLETED', '上一年度度度考评已归档');

SELECT setval('hr_performance_plan_id_seq', (SELECT MAX(id) FROM hr_performance_plan));

INSERT INTO hr_performance_record (plan_id, emp_id, emp_name, emp_no, dept_id, dept_name, post, self_score, self_comment, manager_score, manager_comment, final_score, rating, coefficient, status, evaluated_at) VALUES
(1, 1, '张三', 'EMP1001', 5, '前端架构组', '前端高级工程师', 92.0, '完成了管理后台前端架构现代化升级、微前端与动态路由改造，按时高质交付各模块。', 94.0, '技术交付稳健，组件化与交互质感表现优异，具备良好的团队协同意识。', 93.4, 'A', 1.20, 'COMPLETED', '2026-03-30 15:30:00+08'),
(1, 2, '李四', 'EMP1002', 6, '后端架构组', 'NestJS后端专家', 96.0, '主导了RBAC多权限架构升级、TypeORM性能优化与大数据流式防OOM导出，接口平均耗时<50ms。', 97.0, '架构攻坚能力过硬，多次化解高并发瓶颈，积极指导初中级工程师，表现卓越。', 96.7, 'S', 1.50, 'COMPLETED', '2026-03-30 16:10:00+08'),
(1, 3, '王五', 'EMP1003', 3, '人事行政部', 'HR人事专员', 88.0, '推进了考勤排班日历、薪资一键全员核算与保密工资条闭环系统的落地，员工满意度高。', NULL, NULL, NULL, NULL, 1.00, 'PENDING_MANAGER', NULL);

