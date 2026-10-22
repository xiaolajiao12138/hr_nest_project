# 企业级HR人事后台管理系统 (HR Personnel Management System)

本项目是一套高标准、生产就绪的企业级前后端分离人事后台管理系统。
核心特色在于**菜单路由信息完全存储在数据库中，前端工程不写死任何业务路由配置**，登录后后端根据当前登录用户的角色权限动态返回路由清单，前端利用 Vue Router 动态生成并挂载路由。

---

## 🛠️ 技术栈总览

| 分层 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端** | Vue 3 + Vite + Element Plus + Pinia + Vue Router | 组合式 API (Setup)、动态路由、全局封装组件库 |
| **后端** | NestJS + TypeORM | 模块化架构、BaseService抽离、装饰器/拦截器/过滤器 |
| **数据库** | PostgreSQL 16 (支持 Navicat Premium 连接管理) | 关系型数据库、强一致性事务 ACID 保障 |
| **缓存** | Redis 7 | 验证码校验、Token黑名单与无感续期缓存 |
| **对象存储**| MinIO (生产可无缝平替阿里云 OSS) | 独立桶隔离、临时预签名 URL、文件在线预览 |
| **报表引擎**| ExcelJS | 逐行格式校验、整体事务回滚、分页流式大数据导出 (防OOM) |
| **认证方案**| JWT + RefreshToken | 无感自动刷新凭证机制 |
| **权限模型**| RBAC (用户 - 角色 - 菜单 - 按钮权限) | 细粒度接口与按钮级权限控制 (`v-hasPerm`) |

---

## 🌐 三套独立环境规划与隔离

| 环境 | 前端配置 | 后端配置 | 数据库 / 存储桶 | 特性 |
| :--- | :--- | :--- | :--- | :--- |
| **本地开发 (local)** | `.env.development` | `.env.development` | `hr_manage_db` / `hr-local-files` | 开启热重载、Debug 模式、`synchronize: true`、Docker 一键启动中间件 |
| **测试环境 (test)** | `.env.test` | `.env.test` | `hr_test_db` / `hr-test-files` | 关闭自动建表、使用 TypeORM Migration 迁移脚本、日志按天切片记录至文件 |
| **生产环境 (prod)** | `.env.production` | `.env.production` | `hr_prod_db` / `hr-prod-assets` | 关闭 Debug/Sync、强制 HTTPS、安全响应头 (Helmet)、接口限流 (Rate-Limit)、屏蔽底层堆栈、每日定时自动备份 |

---

## 📁 核心项目目录结构

```text
hr_nest_project/
├── backend/                  # NestJS 后端项目
│   ├── src/
│   │   ├── common/           # 全局基类、DTO、异常过滤器、拦截器、工具类
│   │   │   ├── base/         # BaseEntity、BaseService (CRUD与事务封装)
│   │   │   ├── decorators/   # @OperLog, @Permissions, @CurrentUser
│   │   │   ├── dto/          # PageParamDto, PageResultDto
│   │   │   ├── exceptions/   # BusinessException 统一业务异常
│   │   │   ├── filters/      # AllExceptionsFilter 全局异常分级过滤
│   │   │   ├── guards/       # JwtAuthGuard, PermissionsGuard
│   │   │   ├── interceptors/ # TransformInterceptor (统一JSON结构), OperLogInterceptor
│   │   │   ├── logger/       # Winston 分级按天日志轮转
│   │   │   ├── redis/        # Redis 缓存服务 (带内存优雅降级)
│   │   │   └── utils/        # 日期、脱敏 (手机/身份证)、文件扩展名校验
│   │   ├── config/           # 多环境配置 (configuration.ts, typeorm.config.ts)
│   │   ├── excel/            # 公共 ExcelService (逐行校验/事务回滚/流式导出)
│   │   ├── upload/           # 公共 UploadService (MinIO 上传/预览/隔离桶)
│   │   ├── modules/
│   │   │   ├── rbac/         # 用户、角色、动态菜单路由接口、登录验证码
│   │   │   ├── department/   # 部门架构管理 (递归树、级联防孤儿事务删除)
│   │   │   ├── employee/     # 员工档案 (附件上传、Excel导入事务回滚、流式导出)
│   │   │   ├── leave/        # 请假审批 (核心场景：申请审批与年假扣减原子化事务)
│   │   │   ├── notice/       # 系统通知公告
│   │   │   ├── dict/         # 字典服务 (供前端 useDict 快速读取)
│   │   │   └── log/          # 系统操作审计日志
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── .env.development
│   ├── .env.test
│   └── .env.production
├── frontend/                 # Vue3 前端项目
│   ├── src/
│   │   ├── api/              # Axios 接口层 (auth, dept, employee, leave, system, ops)
│   │   ├── components/       # 全局抽离复用组件
│   │   │   ├── BaseTable.vue       # 封装 Element Plus Table、分页、插槽
│   │   │   ├── BaseSearch.vue      # 通用搜索表单与重置
│   │   │   ├── BaseDialog.vue      # 通用新增/编辑对话框
│   │   │   ├── BaseUpload.vue      # MinIO 附件上传组件 (类型限制、大图预览)
│   │   │   └── BaseImportExcel.vue # Excel 导入弹窗 (模板下载、错误行号高亮)
│   │   ├── hooks/            # usePagination, useDict, usePermission
│   │   ├── layout/           # 后台主布局 (Sidebar根据后端返回菜单渲染, Header, TagsView)
│   │   ├── router/           # 路由配置 (无硬编码业务路由, permission.ts 动态挂载)
│   │   ├── stores/           # Pinia 状态管理 (user, permission, tagsView)
│   │   ├── utils/            # request.ts (Token 携带、401 无感无缝刷新、文件流下载)
│   │   ├── views/            # 业务页面组件 (对应数据库 sys_menu.component)
│   │   ├── App.vue
│   │   └── main.ts
│   ├── .env.development
│   ├── .env.test
│   └── .env.production
├── docker/
│   ├── docker-compose.yml    # 本地一键启动 PostgreSQL 16 + Redis 7 + MinIO
│   ├── init.sql              # 数据库初始化建表 DDL 与全套初始系统菜单/角色数据
│   ├── nginx.conf            # 生产环境 Nginx 反向代理、静态缓存、限流、SSL
│   └── backup.sh             # 生产数据库每日全量定时备份与自动轮转脚本
└── README.md
```

---

## 🎯 动态路由详细运作机制

1. **路由元数据保存在数据库 `sys_menu` 表**：
   包含字段：`path`（如 `/hr/employee`）、`component`（如 `views/hr/employee/index.vue` 或 `Layout`）、`name`、`title`、`icon`、`menu_type`（M目录, C菜单, F按钮）、`perms`（按钮权限标识）、`is_hidden`。
2. **前端代码不预设任何业务路由**：
   `frontend/src/router/index.ts` 仅保留公开白名单路由：`/login` 和 `/404`。
3. **登录鉴权与动态挂载流程**：
   - 用户输入账号密码与验证码登录成功，获取 JWT 与 RefreshToken；
   - 路由守卫 `router/permission.ts` 拦截，调用后端接口 `/api/auth/routes`；
   - 后端根据当前用户角色，查询角色关联的菜单，过滤出 `menu_type in ('M', 'C')` 并构建为树形结构；
   - 前端 Pinia Store (`permission.ts`) 接收到菜单树，通过 Vite 的 `import.meta.glob('../views/**/*.vue')` 动态匹配导入对应的 Vue 单文件组件；
   - 调用 `router.addRoute()` 将动态路由逐个注入当前 Vue Router 实例中；
   - 侧边栏菜单由该数据源驱动渲染；按钮权限由 `usePermission` 与 `v-hasPerm` 指令控制显隐。

---

## 💾 数据库核心表清单

| 表名 | 模块 | 核心字段说明 |
| :--- | :--- | :--- |
| `sys_user` | 用户管理 | 用户名、加密密码、手机、邮箱、部门ID、启用状态 |
| `sys_role` | 角色管理 | 角色名称、权限标识字符（如 `admin`, `hr`）、排序 |
| `sys_menu` | 动态路由&权限 | 路由路径、组件路径、标题、图标、类型(M/C/F)、权限字符 |
| `sys_user_role` | 用户角色关联 | `user_id`, `role_id` 复合主键 |
| `sys_role_menu` | 角色菜单关联 | `role_id`, `menu_id` 复合主键 |
| `sys_dept` | 部门组织 | 部门名称、父级ID、负责人、电话、排序 |
| `sys_dict` | 数据字典 | 字典类型、字典标签、字典键值、排序 |
| `hr_employee` | 员工档案 | 工号、姓名、手机、身份证、岗位、部门、学历、薪资、状态、MinIO附件ID |
| `hr_leave` | 请假审批单 | 请假单号、员工ID、类型(年假/病假/事假)、起止时间、天数、审批状态、批注 |
| `hr_annual` | 员工年假余额 | 员工ID、年度、总天数、已用天数、剩余可用天数（与请假单强事务关联） |
| `sys_file` | 文件资源 | 存储文件名、原始文件名、扩展名、大小、MIME、MinIO桶路径、访问URL |
| `sys_oper_log` | 系统操作审计 | 模块名、请求方式、操作人、IP、入参JSON、返回JSON、耗时、状态 |

---

## 🔒 核心企业级事务场景实现

### 场景 1: Excel 批量导入员工（严格全量校验 + 事务级回滚）
- **路径**: `backend/src/modules/employee/employee.service.ts` -> `importEmployeesFromExcel`
- **逻辑**: 先逐行验证工号唯一性、手机号/身份证正则、部门合法性。若发现**任意一行**校验不通过，**整批数据全部回滚**，返回所有错误行号及原因，不插入任何脏数据；全部校验通过后在同一个事务内批量入库员工并初始化当年年假账户。

### 场景 2: 请假申请与年假扣减（强事务原子化）
- **路径**: `backend/src/modules/leave/leave.service.ts` -> `applyLeave` / `auditLeave`
- **逻辑**: 当申请类型为年假时，在 `withTransaction` 事务内使用**悲观行锁**锁定该员工的 `hr_annual` 记录，校验可用余额。新增请假单与扣减年假余额在同一事务中原子提交；若审批驳回，同样在事务内原路返还年假天数。

### 场景 3: 部门删除防孤儿员工与级联回滚
- **路径**: `backend/src/modules/department/dept.service.ts` -> `deleteDeptWithCascade`
- **逻辑**: 递归检索当前部门及其所有子孙部门。检测到存在在职员工时直接阻断；无员工时开启事务级联删除目标部门和其所有子部门，并解除关联用户的绑定。

---

## 🚀 本地快速启动指南

### 1. 启动本地 Docker 中间件 (PostgreSQL, Redis, MinIO)
确保本地 Docker 守护进程已启动，进入项目根目录：
```bash
cd docker
docker-compose up -d
```
> **Navicat Premium 连接参数**：
> - 主机：`127.0.0.1`
> - 端口：`5432`
> - 用户名：`hr_admin`
> - 密码：`hr_password_2026`
> - 数据库：`hr_manage_db`
>
> 容器启动时会自动执行 `docker/init.sql` 完成 11 张表的建表与全部初始数据导入。
>
> **MinIO 控制台**：
> - 访问地址：`http://127.0.0.1:9001`
> - 账号：`minioadmin` / 密码：`minioadmin_2026`

### 2. 启动 NestJS 后端服务
打开新终端，进入 `backend` 目录：
```bash
cd backend
npm run start:dev
```
后端服务将在 `http://127.0.0.1:3000/api` 运行，并在控制台输出当前环境与模块就绪日志。

### 3. 启动 Vue3 前端工程
打开新终端，进入 `frontend` 目录：
```bash
cd frontend
npm run dev
```
浏览器打开 `http://127.0.0.1:5173`。

### 4. 默认登录账号
- **超级管理员**: `admin` / 密码：`123456`（拥有全部菜单与按钮权限）
- **人事专员**: `hr_user` / 密码：`123456`（拥有人事管理、员工档案、请假审批与公告权限）

---

## 🚢 生产服务器部署方案

### 1. 前端构建与 Nginx 反向代理
在前端打包生成静态文件：
```bash
cd frontend
npm run build:prod
```
打包输出目录为 `frontend/dist`。将 `dist` 目录内容发布到服务器 `/usr/share/nginx/html`，并采用 `docker/nginx.conf` 部署 Nginx：
- 启用 HTTPS 与 SSL 证书；
- 配置 Vue3 HTML5 History 模式的 `try_files $uri $uri/ /index.html`；
- 配置 `/api/` 反向代理到 Node 服务并启用 `rate_limit` 接口防刷；
- 静态资源开启 Gzip 与 30 天浏览器强缓存。

### 2. 后端生产运行 (PM2 托管)
在服务器后端编译并启动：
```bash
cd backend
npm run build
npm install -g pm2
pm2 start dist/main.js --name "hr-manage-backend" -i max --env production
```

### 3. 数据库每日自动定时备份
将 `docker/backup.sh` 脚本放置于生产服务器，并配置 Linux crontab：
```bash
chmod +x /opt/hr_project/docker/backup.sh
# 每天凌晨 02:00 自动执行全量备份并压缩保留30天
0 2 * * * /opt/hr_project/docker/backup.sh >> /var/log/pg_backup.log 2>&1
```
