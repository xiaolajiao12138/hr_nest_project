# 背景防截屏水印、敏感数据脱敏组件与 RSA 加密实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建设企业级数据合规与传输安全体系，包含防篡改背景水印、通用数据脱敏展示组件与前后端打通的 RSA 非对称密码加密传输。

**Architecture:**
- 前端利用 Canvas 绘制带有当前操作人/工号/时间的防截屏平铺水印，并结合 `MutationObserver` 实现防删改自我重生机制；
- 封装脱敏工具包及 `<SensitiveText>` 独立通用组件，支持小眼睛明密文切换与剪贴板支持；
- 后端利用 Node.js 官方 `crypto` 模块提供 RSA 密钥管理与私钥解密服务，前端通过 `jsencrypt` 在登录及敏感操作时以 RSA 公钥加密传输，杜绝网络明文嗅探。

**Tech Stack:** Vue 3.5, TypeScript 5.7, NestJS 10.4, Node crypto, jsencrypt, Element Plus 2.9

## Global Constraints
- 前端与后端均需严格通过编译与类型检查（前端 `vue-tsc` 与后端 `nest build`）；
- 代码与注释一律使用中文；
- 向前兼容现有数据模型，非阻断式渐进增强。

---

### Task 1: 背景防截屏防篡改水印 Hook 与全系统挂载

**Files:**
- Create: `frontend/src/hooks/useWatermark.ts`
- Modify: `frontend/src/layout/index.vue`

**Interfaces:**
- Produces: `useWatermark(): { setWatermark, clearWatermark }`

- [ ] **Step 1: 编写 Canvas 水印与 MutationObserver 防篡改实现 `frontend/src/hooks/useWatermark.ts`**
  实现平铺旋转 -22° 水印文本绘制，挂载全屏透明无阻断图层，通过 `MutationObserver` 监听 DOM 树，若节点被删除或被修改 `style.display/opacity` 则自动重建。

- [ ] **Step 2: 在 `frontend/src/layout/index.vue` 挂载水印**
  监听当前用户信息 `userStore.userInfo`，自动生成如 `"张三 (admin) 2026-10-23"` 的动态防泄露水印。

- [ ] **Step 3: 运行前端构建验证**
  Run: `pnpm --filter hr-manage-frontend run build`
  Expected: 编译通过，无类型报错。

- [ ] **Step 4: 提交 Task 1**
  ```bash
  git add frontend/src/hooks/useWatermark.ts frontend/src/layout/index.vue
  git commit -m "feat: 实现防截屏防篡改背景水印并在后台布局挂载"
  ```

---

### Task 2: 敏感数据脱敏工具包与 `<SensitiveText>` 通用组件

**Files:**
- Create: `frontend/src/utils/mask.ts`
- Create: `frontend/src/components/SensitiveText.vue`
- Modify: `frontend/src/views/hr/employee/index.vue`

**Interfaces:**
- Produces: `maskPhone`, `maskIdCard`, `maskEmail`, `maskName`, `<SensitiveText />` 组件

- [ ] **Step 1: 编写脱敏算法工具包 `frontend/src/utils/mask.ts`**
  实现手机号（前3后4保留，中间4位星号）、身份证号（前6后4保留，中间8位星号）、邮箱、姓名的精准脱敏函数。

- [ ] **Step 2: 封装通用脱敏组件 `frontend/src/components/SensitiveText.vue`**
  支持小眼睛切换明密文，带 Tooltip 提示与一键复制功能。

- [ ] **Step 3: 在员工列表 `frontend/src/views/hr/employee/index.vue` 中集成**
  对表格中的“联系电话”和“身份证号”列应用脱敏渲染插槽。

- [ ] **Step 4: 运行前端构建验证**
  Run: `pnpm --filter hr-manage-frontend run build`
  Expected: 编译通过，无类型报错。

- [ ] **Step 5: 提交 Task 2**
  ```bash
  git add frontend/src/utils/mask.ts frontend/src/components/SensitiveText.vue frontend/src/views/hr/employee/index.vue
  git commit -m "feat: 增加敏感数据脱敏工具及通用切换组件，并应用到员工档案"
  ```

---

### Task 3: 后端 RSA 密钥服务与登录解密支持

**Files:**
- Create: `backend/src/common/security/rsa.service.ts`
- Modify: `backend/src/modules/rbac/rbac.module.ts`
- Modify: `backend/src/modules/rbac/controllers/auth.controller.ts`
- Modify: `backend/src/modules/rbac/services/auth.service.ts`

**Interfaces:**
- Produces: `GET /api/auth/rsa-public-key`, `RsaService.decrypt(cipher: string): string`

- [ ] **Step 1: 实现 Node.js 原生 RSA 服务 `backend/src/common/security/rsa.service.ts`**
  自动生成/加载 2048 位 RSA 密钥对，提供公钥输出和私钥解密方法，解密失败回退原文以保证向前兼容。

- [ ] **Step 2: 在 `AuthController` 中暴露公钥接口并注入 `AuthService` 解密**
  增加 `@Get('rsa-public-key')` 获取公钥；在 `authService.login` 中对传入的密码进行 RSA 私钥解密后再进行密码比对。

- [ ] **Step 3: 运行后端构建验证**
  Run: `pnpm --filter hr-manage-backend run build`
  Expected: NestJS 编译通过，零类型错误。

- [ ] **Step 4: 提交 Task 3**
  ```bash
  git add backend/src/common/security/rsa.service.ts backend/src/modules/rbac/
  git commit -m "feat: 后端增加 RSA 密钥对管理、公钥分发接口与密码解密支持"
  ```

---

### Task 4: 前端 RSA 加密工具集成与登录防窃听实装

**Files:**
- Create: `frontend/src/utils/rsa.ts`
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/views/login/index.vue`

**Interfaces:**
- Produces: `getPublicKeyApi()`, `encryptRsa(text: string): Promise<string>`

- [ ] **Step 1: 编写前端 RSA 工具 `frontend/src/utils/rsa.ts`**
  封装 `jsencrypt`，请求后端获取公钥并加密明文字符串。

- [ ] **Step 2: 在 `frontend/src/views/login/index.vue` 接入加密**
  用户点击登录时，先对密码执行 RSA 公钥加密再提交后端，网络交互全程密文。

- [ ] **Step 3: 运行全局端到端构建验证**
  Run: 前端构建 `pnpm --filter hr-manage-frontend run build` 与 后端构建 `pnpm --filter hr-manage-backend run build`。
  Expected: 前后端均 100% 编译通过。

- [ ] **Step 4: 提交 Task 4**
  ```bash
  git add frontend/src/utils/rsa.ts frontend/src/api/auth.ts frontend/src/views/login/index.vue
  git commit -m "feat: 前端登录接入 RSA 公钥加密传输，杜绝网络密码窃听"
  ```
