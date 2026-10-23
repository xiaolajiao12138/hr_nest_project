# 薪酬核算与电子工资条管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建企业级薪酬核算引擎、月度薪资发放审批、Excel报表导出与员工端防偷窥电子工资条安全查询系统。

**Architecture:**
- 后端新增 `SalaryModule`，基于 TypeORM `SalaryRecord` 实体存储高精度薪酬数据项（收入项、社保公积金个税、缺勤扣款、实发金额）；
- 提供一键全员月度薪酬自动核算算法（联动员工基础薪资与请假记录），支持批核、调整与 ExcelJS 导出；
- 提供员工端工资条安全接口（基于密码加密防窥验证）；
- 前端建立 `frontend/src/views/hr/salary/index.vue` 薪资管理工作台与员工个人工资条抽屉/卡片。

**Tech Stack:** NestJS 10, TypeORM, Decimal/Numeric, ExcelJS, Vue 3.5, Element Plus, TypeScript

## Global Constraints
- 前端与后端均必须 100% 编译通过（`nest build` 与 `vue-tsc --noEmit && vite build`）；
- 代码及注释一律使用简体中文；
- 金额字段采用数据库高精度类型（numeric/decimal(12,2)），避免浮点数精度截断误差；
- 向前兼容现有员工与用户权限体系。

---

### Task 1: 后端薪酬实体与薪资核算核心模块

**Files:**
- Create: `backend/src/modules/salary/entities/salary.entity.ts`
- Create: `backend/src/modules/salary/dto/salary.dto.ts`
- Create: `backend/src/modules/salary/salary.service.ts`
- Create: `backend/src/modules/salary/salary.controller.ts`
- Create: `backend/src/modules/salary/salary.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `POST /api/salary/calculate`, `GET /api/salary/list`, `PUT /api/salary/:id`, `POST /api/salary/confirm`, `GET /api/salary/export`, `GET /api/salary/my-payslips`, `POST /api/salary/my-payslips/verify`

- [ ] **Step 1: 创建薪资实体 `salary.entity.ts` 与 DTO**
  定义收入项（baseSalary, postSalary, performanceSalary, overtimeSalary, allowance）、扣减项（leaveDeduction, socialSecurity, housingFund, tax）、合计项（grossSalary, netSalary）与状态（1:草稿, 2:已确认, 3:已发放）。

- [ ] **Step 2: 实现薪资核算算法与业务服务 `salary.service.ts`**
  实现自动抓取当月在职员工、计算缺勤扣款（根据请假天数比例计算）、计算五险一金预估与个税预扣、生成实发薪资。实现导出 Excel、单项微调、批量发放、个人安全工资条验证。

- [ ] **Step 3: 编写控制器 `salary.controller.ts` 并在 `app.module.ts` 注册**
  配置权限守卫与当前登录人装饰器。

- [ ] **Step 4: 运行后端构建编译验证**
  Run: `npm --prefix backend run build`
  Expected: 0 错误编译通过。

- [ ] **Step 5: 提交 Task 1**
  ```bash
  git add backend/src/modules/salary/ backend/src/app.module.ts
  git commit -m "feat: 后端新增薪酬核算服务、批量发薪与电子工资条管理模块"
  ```

---

### Task 2: 前端薪资 API 接口与国际化字典补充

**Files:**
- Create: `frontend/src/api/salary.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Modify: `frontend/src/locales/ja-JP.ts`

**Interfaces:**
- Produces: `getSalaryListApi`, `calculateSalaryApi`, `updateSalaryApi`, `confirmSalaryApi`, `exportSalaryApi`, `getMyPayslipsApi`, `verifyPayslipApi`

- [ ] **Step 1: 创建 `frontend/src/api/salary.ts`**
  封装薪酬核算、列表分页、更新、发薪与个人工资条接口。

- [ ] **Step 2: 补充中/英/日多语言词条**
  添加薪酬管理、基本工资、应发工资、实发工资、五险一金、工资条密码等词条。

- [ ] **Step 3: 前端构建静态校验**
  Run: `npm --prefix frontend run build`
  Expected: 编译通过。

- [ ] **Step 4: 提交 Task 2**
  ```bash
  git add frontend/src/api/salary.ts frontend/src/locales/
  git commit -m "feat: 补充薪酬核算 API 接口定义与中英日多语言字典"
  ```

---

### Task 3: 前端薪酬核算管理工作台开发

**Files:**
- Create: `frontend/src/views/hr/salary/index.vue`
- Modify: `frontend/src/router/index.ts`

**Interfaces:**
- Produces: 薪资列表工作台、月度薪酬统计卡片（总发薪资、平均薪资、发薪人数）、一键核算弹窗、明细调整弹窗、导出 Excel。

- [ ] **Step 1: 编写 `frontend/src/views/hr/salary/index.vue`**
  实现薪资管理主页面：顶部核心统计 KPI（实发总额、社保个税扣缴总额、待发薪人数）、搜索筛选、BaseTable 展示、一键生成当月薪资草稿、批量发薪。

- [ ] **Step 2: 在路由与系统页面中注册 `/hr/salary`**
  配置路由懒加载与权限标识。

- [ ] **Step 3: 前端构建编译验证**
  Run: `npm --prefix frontend run build`
  Expected: 编译通过，无类型错误。

- [ ] **Step 4: 提交 Task 3**
  ```bash
  git add frontend/src/views/hr/salary/index.vue frontend/src/router/index.ts
  git commit -m "feat: 开发前端薪酬核算工作台页面与路由注册"
  ```

---

### Task 4: 员工端电子工资条安全查询与二次验证抽屉

**Files:**
- Create: `frontend/src/views/hr/salary/components/MyPayslipDrawer.vue`
- Modify: `frontend/src/layout/Header.vue`

**Interfaces:**
- Produces: 员工在 Header 或个人中心一键打开“我的工资条”，输入查看密码（默认支持初始密码或免密模式）后以精美卡片查看各项收入扣减明细。

- [ ] **Step 1: 封装 `MyPayslipDrawer.vue` 电子工资条抽屉组件**
  支持历史月份下拉切换、密码验证与防偷窥隐私折叠、明细分类卡片（基本薪资、津贴奖金、社保公积金、实发到手）。

- [ ] **Step 2: 在 `Header.vue` 个人下拉菜单增加【我的工资条】入口**
  点击一键呼出工资条抽屉。

- [ ] **Step 3: 全局前后端编译构建验证**
  Run: 前端 `npm --prefix frontend run build` 与 后端 `npm --prefix backend run build`。
  Expected: 全部 100% 成功通过。

- [ ] **Step 4: 提交 Task 4 与全案验收**
  ```bash
  git add frontend/src/views/hr/salary/components/MyPayslipDrawer.vue frontend/src/layout/Header.vue
  git commit -m "feat: 实现员工端电子工资条安全防偷窥查询与 Header 入口集成"
  ```
