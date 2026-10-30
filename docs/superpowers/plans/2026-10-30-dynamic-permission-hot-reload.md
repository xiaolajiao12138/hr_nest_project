# 企业级无感动态权限控制（热重载）实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底重构当前 RBAC 权限控制体系，消除静态 JWT 权限绑定的架构缺陷，实现管理员在后台调整角色、赋权或更新菜单后，在线员工无需退出登录、无需手动刷新页面即可实时生效最新接口权限、动态路由及按钮显示。

**Architecture:** 
1. **后端权威实时鉴权层**：解耦 JWT Payload 中的静态角色与权限，以 Redis 缓存为第一读源、PostgreSQL 为落盘兜底源，在 `PermissionsGuard` / `JwtStrategy` 中实施毫秒级实时权限校验与用户启用状态熔断；在角色/用户/菜单变更时触发多级缓存主动驱逐；
2. **全双工实时同步管道**：通过 `SseService` 事件流向受影响在线客户端广播 `PERMISSION_UPDATE` 信号；
3. **前端热重载自愈引擎**：前端在 Pinia 中支持无感路由重构（`reloadRoutes`），自动刷新侧边栏菜单响应式对象，并让 `v-hasPerm` 指令与全局响应式拦截器具备实时同步能力。

**Tech Stack:** NestJS 10, TypeORM, Redis (ioredis), RxJS (SSE), Vue 3, Pinia, Vue Router 4, Element Plus.

**Spec:** `docs/superpowers/plans/2026-10-30-dynamic-permission-hot-reload.md`

## Global Constraints
- 遵循强制简体中文规则，代码注释与提交信息使用中文。
- 当前代码即最新代码，所有任务基于最新代码更新，禁止破坏现有人事/薪资/考勤/绩效业务逻辑。
- 遵循零外部网络依赖与本地开发无 Redis 时的降级自愈能力。

## Review Focus
1. 管理员停用某员工账号时，该员工下次请求或 SSE 推送时能否立即中断并抛出 401 强制下线？
2. 管理员收回某角色的菜单权限时，正在该页面的员工是否会被优雅重定向回工作台而不是白屏崩溃？
3. 本地开发未启动 Redis 时，内置的 `fallbackMemory` 缓存能否正常维持权限动态更新？
4. 频繁修改权限时，前端 SSE 是否存在抖动防抖或重复创建路由引发的警告？
5. 按钮级指令 `v-hasPerm` 在权限更新后能否平滑感知并正确显隐？

---

### Task 1: 后端权限权威校验与缓存服务 (AuthCacheService)

**Files:**
- Create: `backend/src/modules/rbac/services/auth-cache.service.ts`
- Modify: `backend/src/modules/rbac/rbac.module.ts`
- Modify: `backend/src/modules/rbac/jwt.strategy.ts`
- Modify: `backend/src/common/guards/permissions.guard.ts`

**Interfaces:**
- Produces: `AuthCacheService.getUserAuthorities(userId: number): Promise<{ roles: string[]; permissions: string[]; status: number }>`
- Produces: `AuthCacheService.clearUserAuthorities(userId?: number): Promise<void>`

- [x] **Step 1: 实现 `AuthCacheService`**
在 `backend/src/modules/rbac/services/auth-cache.service.ts` 中实现高可用权限缓存：
- 定义缓存键规则：`auth:user_auth:${userId}`，默认 TTL 1800 秒（30分钟）；
- 优先从 `RedisService` 获取，未命中时联查用户数据库（包含 `roles` 与 `roles.menus` 状态），计算去重后的 `roleKeys` 与 `permissions` 并回填 Redis；
- 提供 `clearUserAuthorities(userId)` 清除单用户缓存；提供 `clearAllAuthorities()` 批量清除所有用户权限缓存。

- [x] **Step 2: 改造 `JwtStrategy` 与 `PermissionsGuard`**
- 在 `JwtStrategy.validate(payload)` 中，调用 `AuthCacheService.getUserAuthorities(payload.userId)`：
  - 若 `status !== 1`，立即抛出 `UnauthorizedException('账号已被禁用或状态异常')`；
  - 将实时的 `roles` 与 `permissions` 注入到 `req.user` 中；
- 在 `PermissionsGuard` 中，读取动态更新后的 `req.user`，确保持续调用最新权限，不再受限于静态 JWT Payload。

- [x] **Step 3: 注册模块并运行后端测试**
在 `backend/src/modules/rbac/rbac.module.ts` 中提供并导出 `AuthCacheService`。

---

### Task 2: 后端业务变更联动主动驱逐与 SSE 实时广播

**Files:**
- Modify: `backend/src/modules/rbac/services/role.service.ts`
- Modify: `backend/src/modules/rbac/services/user.service.ts`
- Modify: `backend/src/modules/rbac/services/menu.service.ts`
- Modify: `backend/src/modules/sse/sse.service.ts`

**Interfaces:**
- Consumes: `AuthCacheService.clearAllAuthorities()`, `AuthCacheService.clearUserAuthorities()`
- Produces: `SseService.broadcastPermissionUpdate(message?: string)`

- [x] **Step 1: 在 `SseService` 中拓展权限变动事件**
在 `backend/src/modules/sse/sse.service.ts` 的 `SsePayload` 中增加 `'PERMISSION_UPDATE'` 类型，并封装便捷广播方法：
```typescript
broadcastPermissionUpdate(message = '系统权限与功能配置已更新') {
  this.broadcast({
    type: 'PERMISSION_UPDATE',
    message,
    timestamp: Date.now(),
  });
}
```

- [x] **Step 2: 角色/用户/菜单变更时触发驱逐与广播**
- 在 `RoleService.updateRoleMenus`、`createRole`、`deleteRole` 完成后，调用 `clearAllAuthorities()` 并触发 `broadcastPermissionUpdate('角色权限已更新')`；
- 在 `UserService.updateUser`（分配角色）、`changeStatus` 完成后，调用 `clearUserAuthorities(userId)` 并触发 `broadcastPermissionUpdate('用户角色与账号状态已变更')`；
- 在 `MenuService.createMenu`、`updateMenu`、`deleteMenu` 完成后，调用 `clearAllAuthorities()` 并触发 `broadcastPermissionUpdate('系统菜单配置已更新')`。

---

### Task 3: 前端动态路由与侧边栏无感热重载引擎

**Files:**
- Modify: `frontend/src/stores/permission.ts`
- Modify: `frontend/src/stores/notify.ts`
- Modify: `frontend/src/stores/user.ts`
- Modify: `frontend/src/utils/request.ts`

**Interfaces:**
- Produces: `permissionStore.reloadRoutes(router: Router): Promise<void>`

- [x] **Step 1: 在 `permissionStore` 中实现 `reloadRoutes`**
- 提供 `reloadRoutes(router: any)` 方法：
  - 记录旧动态路由名称清单；
  - 重新请求最新的后端动态路由树 `getDynamicRoutesApi()`；
  - 清理旧的动态路由映射（调用 `router.removeRoute(name)`）；
  - 循环调用 `router.addRoute()` 挂载最新的 Route 记录；
  - 响应式刷新 `sidebarMenus`，侧边栏菜单立即动态改变；
  - 检查当前路由（`router.currentRoute.value.path`）是否仍被允许访问，若已被剔除，给出轻量提示并安全重定向至 `/dashboard`。

- [x] **Step 2: 在 `notifyStore` 中监听 `PERMISSION_UPDATE`**
- 在 `frontend/src/stores/notify.ts` 的 `handleSseMessage` 中拦截 `PERMISSION_UPDATE`：
  - 调用 `userStore.getInfo()` 静默更新当前用户的最新 `roles` 与 `permissions`；
  - 调用 `permissionStore.reloadRoutes(router)` 实现全自动无感静默热重载；
  - 弹出 Element Plus 轻量提示：`ElNotification.info({ title: '权限同步', message: '系统岗位权限已实时更新，功能菜单已自动对齐。', duration: 4000 })`。

- [x] **Step 3: 前端 Axios 响应拦截器 403 兜底自动重载**
在 `frontend/src/utils/request.ts` 的响应拦截器中：
若接口返回 403 Forbidden（权限被撤回），自动触发一次静默权限与路由热重载，防止界面残留失效按钮或菜单。

---

### Task 4: 前端按钮权限指令与响应式 Hooks 升级

**Files:**
- Modify: `frontend/src/hooks/usePermission.ts`

- [x] **Step 1: 升级 `vHasPerm` 支持动态响应式**
- 将 `vHasPerm` 改造为支持 `mounted` 与 `updated`：
  - 保留元素在无权限时的 display 状态，或者使用带标记的注释/占位隐藏；
  - 或者支持与 `userStore.permissions` 深度绑定；
- 在 `usePermission` 中返回响应式计算函数 `hasPerm(perm)`，支持在业务页面模板中直接使用 `v-if="hasPerm('hr:employee:add')"`。

---

### Task 5: 验证测试与代码编译

**Files:**
- Verification: 后端 `pnpm run build`，前端 `pnpm build`
- 业务测试：验证权限实时生效链路与类型安全。

- [x] **Step 1: 构建校验**
分别在 `backend` 和 `frontend` 执行打包与编译，确保无类型错误。
- [x] **Step 2: 输出最终架构与验收使用说明**
汇报完整改造细节与测试验证结果。
