# 工作台左侧菜单恢复与基于 SSE 实时通讯推送实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决首页工作台因缺少 Layout 骨架导致左侧菜单丢失的问题，并构建基于 SSE (Server-Sent Events) 的端到端实时通讯推送系统（审批提醒、全员公告右下角弹窗、待办徽标数字实时增减）。

**Architecture:** 
1. 前端动态路由转换优化：对顶级独立单页（如 `/dashboard`）自动以 `Layout` 骨架包裹，同时保持侧边栏菜单叶子节点直接导航；
2. 后端基于 NestJS 内置 `@Sse` 与 RxJS `Subject` 构建高并发、轻量级的长连接事件流服务 `SseModule`，支持 JWT 鉴权、心跳保活、用户定向推送与全员广播；
3. 在请假审批模块（`LeaveService`）与公告发布模块（`NoticeService`）触发事件，驱动前端 Pinia Store 接收事件并完成弹窗呈现与 Header/侧边栏待办徽标实时同步。

**Tech Stack:** NestJS, TypeORM, RxJS, Vue 3, Pinia, Element Plus (ElNotification, ElBadge), EventSource (SSE).

---

## 任务拆解与执行步骤

### 任务 1: 修复工作台左侧菜单显示（包装 Layout 骨架）

**文件清单:**
- 修改: `frontend/src/stores/permission.ts`
- 修改: `frontend/src/router/permission.ts`

**步骤:**
- [ ] 检查 `frontend/src/stores/permission.ts` 中的 `transformRoutes` 方法。
- [ ] 针对 `parentId === 0` 或顶级菜单且 `component !== 'Layout'` 的独立视图（如 `/dashboard`），包装生成以 `Layout` 为父组件、自身为 children 的路由项，确保进入工作台时外层包裹完整 Layout。
- [ ] 确保 `sidebarMenus` 仍然保留原始的根节点路径 `/dashboard`，使得侧边栏菜单正常渲染高亮且点击跳转顺畅。
- [ ] 运行 `npm --prefix frontend run build` 验证前端动态路由编译通过。

---

### 任务 2: 后端构建 SSE 实时推送核心模块（`SseModule`）

**文件清单:**
- 创建: `backend/src/modules/sse/sse.service.ts`
- 创建: `backend/src/modules/sse/sse.controller.ts`
- 创建: `backend/src/modules/sse/sse.module.ts`
- 修改: `backend/src/app.module.ts`

**步骤:**
- [ ] 创建 `sse.service.ts`：
  - 维护用户客户端连接流（`Map<number, Subject<MessageEvent>>`）与广播流；
  - 提供 `sendToUser(userId, data)` 定向推送；
  - 提供 `broadcast(data)` 全员广播；
  - 提供 `sendPendingBadgeUpdate(count)` 待办总数推送；
  - 内置 25 秒 `:keepalive` 心跳包机制防止网关超时。
- [ ] 创建 `sse.controller.ts`：
  - 端点 `@Sse('stream')`（完整路径 `/api/sse/stream`）；
  - 从 Query `?token=xxx` 或 Header 解析验证 JWT，提取 `userId` 并建立 SSE 数据流；客户端断开连接时自动清理内存中的 Subject。
- [ ] 创建 `sse.module.ts` 并导出 `SseService`，在 `backend/src/app.module.ts` 中注册。
- [ ] 运行 `npm --prefix backend run build` 验证模块编译无误。

---

### 任务 3: 在请假审批与系统公告业务中接入 SSE 触发

**文件清单:**
- 修改: `backend/src/modules/leave/leave.service.ts`
- 修改: `backend/src/modules/leave/leave.module.ts`
- 修改: `backend/src/modules/notice/notice.service.ts`
- 修改: `backend/src/modules/notice/notice.module.ts`

**步骤:**
- [ ] `LeaveModule` 导入 `SseModule`，并在 `leave.service.ts` 中注入 `SseService`：
  - 在 `applyLeave`（提交请假）成功后，统计当前最新待审批数，触发 `sendPendingBadgeUpdate`；
  - 在 `auditLeave`（审核请假）成功后，更新最新待办徽标数，并向申请人（`leave.empId`）发送 `LEAVE_AUDIT_NOTIFY` 审批结果提醒；
- [ ] `NoticeModule` 导入 `SseModule`，并在 `notice.service.ts` 中注入 `SseService`：
  - 在新建发布公告或通过 `changeStatus` 启用发布公告时，触发 `NOTICE_BROADCAST` 全员广播推送（包含标题、类型、发布时间）。
- [ ] 运行 `npm --prefix backend run build` 验证业务链路集成。

---

### 任务 4: 前端构建 SSE 监听 Store 与全局消息推送响应

**文件清单:**
- 创建: `frontend/src/stores/notify.ts`
- 修改: `frontend/src/layout/Header.vue`
- 修改: `frontend/src/layout/Sidebar/SidebarItem.vue`
- 修改: `frontend/src/layout/index.vue`

**步骤:**
- [ ] 创建 `frontend/src/stores/notify.ts`：
  - 使用 Pinia 管理当前用户在线 SSE 连接；
  - 维护 `pendingLeaveCount` 待办数量；
  - 接收到 `NOTICE_BROADCAST`：调用 `ElNotification` 在页面右下角弹出公告卡片（包含标题、发布时间）；
  - 接收到 `LEAVE_AUDIT_NOTIFY`：调用 `ElNotification` 顶部通知弹窗（提示审核通过或驳回）；
  - 接收到 `TODO_BADGE_UPDATE`：实时响应更新 `pendingLeaveCount`；
  - 优雅重连与退出注销处理。
- [ ] 修改 `frontend/src/layout/Header.vue`：
  - 在右侧用户头像左侧添加「代办/消息」铃铛图标，使用 `el-badge` 绑定 `pendingLeaveCount`；
  - 点击铃铛直接便捷跳转至 `/hr/leave`（请假审批）；
- [ ] 修改 `frontend/src/layout/Sidebar/SidebarItem.vue`：
  - 当菜单项路径为 `/hr/leave` 且待办数大于 0 时，显示红色待办角标。
- [ ] 修改 `frontend/src/layout/index.vue`：
  - 在组件挂载时初始化 SSE 连接，卸载或登出时安全断开。
- [ ] 运行 `npm --prefix frontend run build` 验证前端完整打包与类型安全。

---

### 任务 5: 全量验证与代码提交推送

**步骤:**
- [ ] 检查并执行前后端构建验证：
  - `npm --prefix backend run build`
  - `npm --prefix frontend run build`
- [ ] Git 提交并推送至 GitHub 远端 `main` 分支。
