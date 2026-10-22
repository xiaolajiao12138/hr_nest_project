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
import { ref } from 'vue';
import Sidebar from './Sidebar/index.vue';
import Header from './Header.vue';
import TagsView from './TagsView.vue';

const isCollapse = ref(false);

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value;
};
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
