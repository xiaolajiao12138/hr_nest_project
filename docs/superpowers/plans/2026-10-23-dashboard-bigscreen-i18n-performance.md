# 仪表盘可视化图表一键全屏、RGB自定义主题、国际化与首屏性能提升实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为系统提供仪表盘图表一键全屏沉浸大屏支持、RGB调色板自定义主题生成引擎、常用国际化多语言（中/英/日）联动、以及首屏代码分包加载加速与交互骨架屏质感优化。

**Architecture:** 
- 前端利用 Vite 的 Rollup manualChunks 精细拆分第三方大依赖（echarts、element-plus、vue-core），配合 index.html 预加载骨架屏缩减首屏白屏时间；
- 基于色彩空间线性混合算法自研轻量主题生成引擎，动态注入 CSS 变量与 localStorage 持久化；
- 构建响应式 i18n 体系，与 Element Plus 官方语言包深度联动；
- 基于 HTML5 Fullscreen API 与 ECharts 实例防抖 resize 实现仪表盘图表的一键全屏无缝沉浸式缩放。

**Tech Stack:** Vue 3.5, Vite 6, TypeScript 5.7, Pinia 2.3, Element Plus 2.9, ECharts 6.1

**Spec:** `docs/superpowers/specs/2026-10-23-dashboard-bigscreen-i18n-performance-design.md`

## Global Constraints
- 前端生产构建必须无警告通过 `vue-tsc --noEmit && vite build`；
- 所有代码注释一律使用中文；
- 遵循 Vue 3 `<script setup lang="ts">` 组合式 API 与 TypeScript 严格类型；
- 不破坏现有业务逻辑与数据接口，向前完全兼容。

## Review Focus
1. **全屏状态切换下的 ECharts 图表尺寸拉伸/错位**：全屏进入或退出（特别是用户按原生 Esc 键）时，DOM 尺寸变化需及时触发防抖 resize，图表不可模糊或溢出；
2. **RGB 取色生成算法的色彩边界问题**：纯白（#ffffff）或纯黑（#000000）极端值时生成的衍生色阶必须合理，不可出现 NaN 或越界 RGB 值；
3. **Element Plus 组件在多语言切换后的即时响应**：日期选择器、分页器与系统弹窗在切换语言后无须刷新页面即可立即更新文案；
4. **Vite 分包后循环依赖与共享模块加载问题**：manualChunks 拆包不能导致循环引用或缺失导出，构建后在本地 preview 可正常运行；
5. **首屏骨架屏与 Vue 挂载的衔接平滑度**：Vue 挂载完成瞬间平滑接管，不能出现样式闪烁（FOUC）或布局跳动。

---

### Task 1: 首屏加载优化（Vite manualChunks 分包）与 HTML 预加载骨架屏

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: Vite 默认构建配置
- Produces: 细粒度 Rollup 分包产物（`echarts-vendor`, `element-plus-vendor`, `vue-core-vendor` 等）与首屏占位骨架屏

- [ ] **Step 1: 在 `frontend/vite.config.ts` 中配置 Rollup 分包优化**
  配置 `build.rollupOptions.output.manualChunks`，对第三方依赖进行分离：
  - `echarts`: 拆入 `echarts-vendor`
  - `element-plus`: 拆入 `element-plus-vendor`
  - `@element-plus/icons-vue`: 拆入 `element-icons-vendor`
  - `vue`, `vue-router`, `pinia`, `axios`: 拆入 `vue-core-vendor`
  - 其他 node_modules: 拆入 `common-vendor`

- [ ] **Step 2: 在 `frontend/index.html` 中注入品牌加载骨架屏**
  在 `<div id="app">` 内部添加轻量 CSS 脉冲加载占位动画与文字“HR 人力资源数字化管理系统正在初始化...”，在 Vue 挂载后自动被覆盖。

- [ ] **Step 3: 运行生产构建验证分包结果**
  Run: `npm --prefix frontend run build`
  Expected: 构建成功，消除单一 1.29MB 巨石 Chunk，产出独立的 `echarts-vendor`、`element-plus-vendor`、`vue-core-vendor`。

- [ ] **Step 4: 提交构建优化成果**
  ```bash
  git add frontend/vite.config.ts frontend/index.html
  git commit -m "perf: 优化 Vite 分包策略并添加首屏加载骨架屏"
  ```

---

### Task 2: RGB 调色板自定义主题引擎与持久化

**Files:**
- Create: `frontend/src/utils/theme.ts`
- Create: `frontend/src/stores/theme.ts`

**Interfaces:**
- Consumes: RGB/Hex 颜色字符串
- Produces: `generateThemeColors(primary: string): Record<string, string>`, `applyTheme(primary: string): void`, `useThemeStore()`

- [ ] **Step 1: 实现颜色梯度计算算法 `frontend/src/utils/theme.ts`**
  实现：
  - `hexToRgb(hex: string): { r: number, g: number, b: number } | null`
  - `rgbToHex(r: number, g: number, b: number): string`
  - `mixColor(color1: string, color2: string, weight: number): string`
  - `generateThemeColors(primary: string): Record<string, string>`（包含 `--el-color-primary`，`--el-color-primary-light-1` 至 `light-9`，`--el-color-primary-dark-2`）
  - `applyTheme(primary: string): void`：写入 `document.documentElement.style.setProperty` 并同步更新辅助边框/激活背景。

- [ ] **Step 2: 创建 Pinia 主题状态存储 `frontend/src/stores/theme.ts`**
  定义 `useThemeStore`，包含：
  - 状态：`primaryColor: ref(localStorage.getItem('app-theme-color') || '#409EFF')`
  - 方法：`setPrimaryColor(color: string)`，写入 store、localStorage 并调用 `applyTheme(color)`；`initTheme()` 在应用启动时自动应用存储的主题色。

- [ ] **Step 3: 在 `frontend/src/main.ts` 初始化主题**
  在挂载前调用 `useThemeStore().initTheme()`。

- [ ] **Step 4: 验证主题计算与应用逻辑**
  通过本地构建与启动测试验证无类型错误：
  Run: `npm --prefix frontend run build`
  Expected: 编译通过，无类型报错。

- [ ] **Step 5: 提交主题引擎模块**
  ```bash
  git add frontend/src/utils/theme.ts frontend/src/stores/theme.ts frontend/src/main.ts
  git commit -m "feat: 增加 RGB 色盘自定义主题引擎与 Pinia 状态管理"
  ```

---

### Task 3: 常用国家语言国际化 (i18n) 响应式系统

**Files:**
- Create: `frontend/src/locales/zh-CN.ts`
- Create: `frontend/src/locales/en-US.ts`
- Create: `frontend/src/locales/ja-JP.ts`
- Create: `frontend/src/locales/index.ts`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: 语言类型 `'zh-CN' | 'en-US' | 'ja-JP'`
- Produces: `useI18n(): { locale, setLocale, t, elementLocale, availableLocales }`

- [ ] **Step 1: 创建多语言字典文件**
  - `frontend/src/locales/zh-CN.ts`：包含通用按钮、Header、仪表盘各指标项与图表标题的中文文案。
  - `frontend/src/locales/en-US.ts`：对应的英文专业翻译。
  - `frontend/src/locales/ja-JP.ts`：对应的日文专业翻译。

- [ ] **Step 2: 创建轻量响应式 i18n 核心 `frontend/src/locales/index.ts`**
  实现：
  - 映射 Element Plus 语言包：
    - `zh-CN`: `import zhCn from 'element-plus/es/locale/lang/zh-cn'`
    - `en-US`: `import en from 'element-plus/es/locale/lang/en'`
    - `ja-JP`: `import ja from 'element-plus/es/locale/lang/ja'`
  - 导出 `useI18n()` 组合式函数与 `$t(path: string)`，支持对象路径解析（如 `'dashboard.totalEmployees'`）。
  - 支持 `localStorage.getItem('app-locale')` 持久化，提供 `availableLocales` 列表。

- [ ] **Step 3: 修改 `frontend/src/App.vue` 接入动态语言包**
  将写死的 `zhCn` 替换为响应式 `const { elementLocale } = useI18n()`，`<el-config-provider :locale="elementLocale">`。

- [ ] **Step 4: 编译检查验证**
  Run: `npm --prefix frontend run build`
  Expected: 编译通过，Element Plus 语言包与字典类型检查通过。

- [ ] **Step 5: 提交 i18n 模块**
  ```bash
  git add frontend/src/locales/ frontend/src/App.vue
  git commit -m "feat: 建立常用国家语言国际化 (i18n) 响应式体系与 Element Plus 联动"
  ```

---

### Task 4: 顶栏 (Header) 交互升级：RGB 调色板与多语言切换入口

**Files:**
- Modify: `frontend/src/layout/Header.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `useThemeStore()`, `useI18n()`
- Produces: Header 顶栏右侧新增 RGB 取色器弹层与语言切换下拉菜单，全系统主题平滑渐变动效

- [ ] **Step 1: 在 `frontend/src/layout/Header.vue` 引入主题与国际化控制项**
  - 在通知铃铛左侧增加“主题换肤”按钮/取色器（`<el-color-picker v-model="currentThemeColor" show-alpha={false} :predefine="predefineColors" />`），支持自由 RGB 取色与预设经典企业色一键选用。
  - 增加“语言切换”下拉菜单（`<el-dropdown>`），显示国旗与语言名称（🇨🇳 简体中文、🇺🇸 English、🇯🇵 日本語），选定后调用 `setLocale`。
  - 顶栏右侧所有文案与下拉菜单支持 `$t` 国际化。

- [ ] **Step 2: 注入系统交互平滑过渡样式**
  在 `App.vue` 或全局样式中，为按钮、卡片、侧边栏和顶栏增加 `transition: color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease;`，使调色板选色时界面平滑过渡，无生硬闪跳。

- [ ] **Step 3: 编译与静态检查**
  Run: `npm --prefix frontend run build`
  Expected: 编译通过，无类型错误。

- [ ] **Step 4: 提交 Header 交互升级代码**
  ```bash
  git add frontend/src/layout/Header.vue frontend/src/App.vue
  git commit -m "feat: 顶栏集成 RGB 自定义调色板与多语言切换入口"
  ```

---

### Task 5: 仪表盘可视化图表一键全屏放大与响应式自适应

**Files:**
- Modify: `frontend/src/views/dashboard/index.vue`

**Interfaces:**
- Consumes: HTML5 Fullscreen API, ECharts `resize()`, `useI18n()`
- Produces: 仪表盘图表一键全屏沉浸大屏交互、防抖自适应响应

- [ ] **Step 1: 在仪表盘顶部操作栏添加“全屏大屏 / 退出全屏”切换按钮**
  在欢迎栏右侧“刷新数据”旁增设全屏操作按钮，绑定 `toggleFullscreen` 方法，配合 `<FullScreen />` / `<Aim />` 图标。

- [ ] **Step 2: 实现图表容器全屏逻辑与样式沉浸化**
  - 绑定 `dashboardRef` 容器，点击全屏调用 `dashboardRef.value.requestFullscreen()` 或 `document.exitFullscreen()`。
  - 增加 `.is-fullscreen` 样式类：当处于全屏状态时，背景采用微深色现代质感背景或高对比度卡片布局，隐藏非必要的页边空白，呈现大屏数据视觉冲击力。

- [ ] **Step 3: 监听全屏变化并防抖触发图表自适应 resize**
  监听 `document.addEventListener('fullscreenchange', handleFullscreenChange)`：
  在全屏进入与退出（包括按 Esc 键）后，延迟 100ms 触发：
  ```ts
  deptChartInstance?.resize();
  eduChartInstance?.resize();
  leaveChartInstance?.resize();
  ```
  组件销毁（`onUnmounted`）时注销事件监听，防止内存泄露。

- [ ] **Step 4: 接入多语言文案适配**
  使用 `useI18n` 将仪表盘各指标卡标题、提示语、图表标题及图例等替换为 `$t` 动态文案。当语言切换时，动态更新 ECharts 的 option 标题与轴文本。

- [ ] **Step 5: 编译并验证**
  Run: `npm --prefix frontend run build`
  Expected: 编译通过，无类型错误。

- [ ] **Step 6: 提交仪表盘全屏大屏与多语言特性**
  ```bash
  git add frontend/src/views/dashboard/index.vue
  git commit -m "feat: 仪表盘图表支持一键全屏放大、自适应缩放与多语言适配"
  ```

---

### Task 6: 完整构建验证与交互质感全链路验收

**Files:**
- Test / Verify all modified and created files across the project

- [ ] **Step 1: 执行严格全量类型检查与生产构建**
  Run: `npm --prefix frontend run build`
  Expected: `vue-tsc --noEmit` 零类型报错，Vite 编译打包顺利完成，各分包体积均维持在合理范围。

- [ ] **Step 2: 预览启动服务验证功能与视觉效果**
  Run: `npm --prefix frontend run preview` 或 `npm --prefix frontend run dev`
  Expected: 开发/预览服务正常启动，仪表盘全屏放大平滑、RGB 调色板主题即时生成生效、中英日多语言切换流畅、首屏加载骨架屏过渡自然。

- [ ] **Step 3: 最终整合提交**
  ```bash
  git status
  git commit -m "chore: 完成仪表盘一键全屏、RGB调色板自定义主题、多语言与性能优化全量验收"
  ```
