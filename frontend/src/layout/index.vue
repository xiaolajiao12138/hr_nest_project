<template>
  <div class="app-layout">
    <!-- 侧边菜单栏 -->
    <div class="sidebar-wrapper" :class="{ 'is-collapsed': isCollapse }">
      <Sidebar :is-collapse="isCollapse" />
    </div>

    <!-- 右侧主体内容区 -->
    <div class="main-container">
      <Header :is-collapse="isCollapse" @toggle="toggleCollapse" />
      <TagsView />

      <div class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Sidebar from './Sidebar/index.vue';
import Header from './Header.vue';
import TagsView from './TagsView.vue';
import { useNotifyStore } from '@/stores/notify';

/**
 * 侧边菜单栏折叠状态响应式变量
 * true 为收起（宽度 64px），false 为展开（宽度 220px）
 */
const isCollapse = ref(false);

const notifyStore = useNotifyStore();

/**
 * 切换侧边栏展开/折叠状态
 */
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value;
};

/**
 * 主骨架挂载完成生命周期钩子
 * 启动 SSE 服务端实时推送长连接，自动拉取未读消息与待审批数量
 */
onMounted(() => {
  notifyStore.initSSE();
});

/**
 * 主骨架卸载/销毁前生命周期钩子
 * 关闭 SSE 长连接并注销重连计时器，杜绝后台游离连接与内存泄漏
 */
onBeforeUnmount(() => {
  notifyStore.closeSSE();
});
</script>

<style scoped>
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.sidebar-wrapper {
  width: 220px;
  height: 100%;
  flex-shrink: 0;
  transition: width 0.3s ease;
}
.sidebar-wrapper.is-collapsed {
  width: 64px;
}
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f0f2f5;
}
.app-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

/* 页面切换动画 */
.fade-transform-leave-active,
.fade-transform-enter-active {
  transition: all 0.25s;
}
.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
