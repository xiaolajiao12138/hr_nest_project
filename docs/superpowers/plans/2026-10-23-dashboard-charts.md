# 工作台首页图表化升级实施计划 (Dashboard ECharts)

> **执行规范：** 按照企业级标准规范落地，包含前后端统计 API 联动与前端响应式 ECharts 图表，生命周期资源防泄漏管理。

**目标：** 将现有人事系统工作台首页改造为可视化企业级数据大屏工作台，集成部门编制统计柱状图、学历画像环形图、近半年月度请假考勤趋势面积折线图。

**技术栈：** Vue 3, Vite, Element Plus, ECharts, NestJS, TypeORM, PostgreSQL.

---

## 任务拆解与实施步骤

### 任务 1：前端安装 ECharts 依赖
**文件：**
- 修改：`frontend/package.json`

**步骤：**
- [ ] 在 `frontend` 运行 `npm install echarts`
- [ ] 验证安装完成无依赖冲突

### 任务 2：后端新增工作台数据统计接口
**文件：**
- 新增：`backend/src/modules/dashboard/dashboard.controller.ts`
- 新增：`backend/src/modules/dashboard/dashboard.service.ts`
- 新增：`backend/src/modules/dashboard/dashboard.module.ts`
- 修改：`backend/src/app.module.ts`

**步骤：**
- [ ] 实现 `DashboardService`：
  - 统计卡片：在职员工数、待审批请假数、部门总数、出勤率；
  - 部门编制：按部门分组统计在职员工人数；
  - 学历画像：按学历分组统计员工占比；
  - 考勤请假趋势：统计近 6 个月各月份不同请假类型（年假、病假、事假）的单数；
- [ ] 实现 `DashboardController`，注册路由 `GET /api/dashboard/stats` 并受 `JwtAuthGuard` 保护；
- [ ] 在 `AppModule` 中导入 `DashboardModule`；
- [ ] 运行 `npm run build` 确保后端编译无报错。

### 任务 3：前端新增 Dashboard API 并重构工作台视图
**文件：**
- 新增：`frontend/src/api/dashboard.ts`
- 修改：`frontend/src/views/dashboard/index.vue`

**步骤：**
- [ ] 在 `frontend/src/api/dashboard.ts` 中封装 `getDashboardStatsApi`；
- [ ] 重构 `frontend/src/views/dashboard/index.vue`：
  - 引入 `echarts` 核心图表；
  - 搭建 3 大图表容器与初始化逻辑；
  - 监听窗口 `resize` 自适应缩放，并在 `onBeforeUnmount` 彻底 `dispose()` 图表实例防内存泄漏；
  - 优雅降级：若后端统计返回空集合，自动展示兜底展示数据，保证任何时候呈现专业视觉。

### 任务 4：全量构建自测与 Git 提交推送
**文件：**
- 全工程

**步骤：**
- [ ] 运行 `npm --prefix backend run build`；
- [ ] 运行 `npm --prefix frontend run build`；
- [ ] 提交代码到 GitHub 仓库并推送。
