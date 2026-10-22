import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import './router/permission'; // 引入路由守卫与动态路由挂载
import { vHasPerm } from './hooks/usePermission'; // 按钮权限指令

const app = createApp(App);

// 全局注册 Element Plus 所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 注册按钮权限自定义指令 v-hasPerm
app.directive('hasPerm', vHasPerm);

app.use(createPinia());
app.use(router);
app.use(ElementPlus);

app.mount('#app');
