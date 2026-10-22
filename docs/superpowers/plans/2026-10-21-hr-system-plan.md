# 企业级HR人事后台管理系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建前后端分离的企业级HR人事后台管理系统，包含RBAC动态路由、部门管理、员工档案（带事务级Excel导入导出与MinIO附件）、请假审批（原子化事务扣减年假）、公告、字典日志，完整工程化与多环境配置。

**Architecture:** 前端基于 Vue3 + Vite + Element Plus + Pinia 动态挂载后端返回的数据库路由；后端基于 NestJS + TypeORM + PostgreSQL + Redis + MinIO，抽离通用 BaseService、UploadService、ExcelService 及统一拦截器与全局异常过滤器。

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Redis, MinIO, exceljs, svg-captcha, Vue3, Vite, Element Plus, Pinia, Vue Router, Axios.

**Spec:** 用户需求规范包含：11张核心表、3套环境隔离（local/test/prod）、动态路由生成机制、严格事务与回滚、封装公共服务与通用Vue3组件。

---

### Task 1: 项目脚手架与环境初始化
- [ ] 创建项目根目录与子工程结构（backend 与 frontend）
- [ ] 编写 docker-compose.yml（PostgreSQL、Redis、MinIO）与初始环境变量
- [ ] 编写数据库建表与初始化数据 SQL 脚本（`docker/init.sql`），包含11张核心表及初始菜单、角色、管理员

### Task 2: NestJS 后端基础设施与通用层实现
- [ ] 配置 `backend/package.json` 及 TypeScript 依赖（nestjs, typeorm, pg, redis/ioredis, minio, exceljs, class-validator, winston 等）
- [ ] 实现多环境配置模块（`config/configuration.ts`）与 TypeORM 动态配置
- [ ] 实现统一返回格式与拦截器（`common/interceptors/transform.interceptor.ts`）
- [ ] 实现全局异常过滤器（`common/filters/all-exceptions.filter.ts`），针对业务异常、TypeORM异常、未知错误做分级捕获并在生产环境屏蔽堆栈
- [ ] 实现日志服务（WinstonLogger，控制台高亮 + 生产环境按天归档文件）
- [ ] 封装基础分页 DTO（`PageParamDto`, `PageResultDto`）
- [ ] 封装通用 BaseService（CRUD、分页查询、事务执行封装）
- [ ] 封装通用工具类（日期处理、数据脱敏、字典解析、Excel格式化）
- [ ] 封装常用装饰器（`@OperLog`, `@Permissions`, `@CurrentUser`）与守卫

### Task 3: 核心公共服务层开发（UploadService & ExcelService）
- [ ] 封装 MinIO `UploadService`：环境隔离桶、上传、预览（预签名URL/流）、删除、扩展名校验、sys_file 记录
- [ ] 封装 `ExcelService`：基于 exceljs 实现通用的行数据验证器、导入事务控制模板、分批流式大数据导出

### Task 4: RBAC 权限与动态路由后端模块开发
- [ ] 定义 User, Role, Menu, RoleMenu 等 TypeORM 实体
- [ ] 实现登录认证模块（AuthModule）：图形验证码、JWT 生成、RefreshToken 续期、用户信息与权限解析
- [ ] 实现菜单路由接口（`MenuService.getDynamicRoutes`），根据当前登录用户角色输出树形菜单和按钮权限清单
- [ ] 实现用户管理与角色管理接口（用户增删改查、分配角色、启用禁用、重置密码）

### Task 5: 业务模块开发（部门、员工档案、请假审批、公告、字典、日志）
- [ ] 部门管理（DeptModule）：树形结构查询、拖拽排序、删除部门事务校验（存在员工禁止删除，无员工事务级联删除所有子部门）
- [ ] 员工档案管理（EmployeeModule）：
  - 基础信息 CRUD
  - 附件上传集成（身份证/学历证明与 sys_file 关联）
  - Excel 批量导入：逐行校验，任一出错整体事务回滚并返回错误行号
  - Excel 大数据分页流式导出
- [ ] 请假审批模块（LeaveModule）：
  - 请假申请发起
  - 审批流程推进
  - 强事务处理：审批通过或提交时同时更新年假余额表（hr_annual）与请假记录（hr_leave），任一失败全量回滚
- [ ] 公告管理（NoticeModule）与数据字典（DictModule）、操作日志（OperLogModule）

### Task 6: Vue3 前端脚手架与公共组件库
- [ ] 配置 `frontend/package.json`、`vite.config.ts`、Pinia、Vue Router、Element Plus
- [ ] 封装通用 Axios 请求客户端（包含 JWT 携带、Token 自动刷新队列、统一错误提示）
- [ ] 封装前端通用公共组件：
  - `BaseTable.vue`：集成表格列配置、分页、多选、操作列
  - `BaseSearch.vue`：动态查询表单
  - `BaseDialog.vue`：统一新增/编辑弹框容器
  - `BaseUpload.vue`：支持预览、上传拦截、类型限制的 MinIO 附件上传组件
  - `BaseImportExcel.vue`：包含模板下载、文件解析、错误行高亮反馈的导入弹窗
- [ ] 封装自定义 Hooks（`usePagination`、`useDict`、`usePermission`）

### Task 7: 前端动态路由与主布局
- [ ] 实现 Pinia 权限与菜单 Store（`permissionStore`, `userStore`）
- [ ] 实现动态路由解析机制：后端返回树形结构菜单 -> 递归转换为 Vue Router RouteRecord -> `router.addRoute` 动态加载，前端无需写死路由清单
- [ ] 路由守卫：登录态检查、白名单判定、动态路由加载状态、404 处理、权限鉴权
- [ ] 后台主布局（Layout）：Header（用户信息、修改密码、退出）、Sidebar（根据后端菜单渲染多级侧边栏）、TagsView、Breadcrumb、MainView

### Task 8: 前端业务页面开发
- [ ] 登录页（账号密码、图形验证码）
- [ ] 系统管理：用户管理、角色管理（分配菜单与权限）、菜单管理（配置路由地址、组件路径、图标等）
- [ ] 部门管理页面（树形展示、增加编辑、事务删除）
- [ ] 员工档案页面（复用 BaseTable、BaseSearch、BaseUpload、BaseImportExcel，导出功能）
- [ ] 请假审批页面（请假申请、审批操作、年假余额卡片）
- [ ] 公告管理页面与数据字典页面

### Task 9: 多环境配置、Docker 部署配置与项目文档
- [ ] 补充前端与后端的 `.env.development`, `.env.test`, `.env.production`
- [ ] 编写生产部署 Nginx 配置、每日数据库备份脚本 `backup.sh`
- [ ] 编写详细的 `README.md` 文档，涵盖系统架构、快速开始、Navicat 连接、多环境切换、测试说明
- [ ] 验证后端构建与前端构建，确保无编译错误
