<template>
  <div class="sidebar-container">
    <div class="logo-box">
      <el-icon :size="24" color="#409EFF"><OfficeBuilding /></el-icon>
      <span class="logo-title">HR人事管理系统</span>
    </div>

    <el-scrollbar>
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
        :unique-opened="true"
        router
      >
        <sidebar-item
          v-for="route in menuList"
          :key="route.path"
          :item="route"
          :base-path="route.path"
        />
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { usePermissionStore } from '@/stores/permission';
import { OfficeBuilding } from '@element-plus/icons-vue';
import SidebarItem from './SidebarItem.vue';

defineProps<{
  isCollapse?: boolean;
}>();

const route = useRoute();
const permissionStore = usePermissionStore();

// 侧边栏菜单完全来源于后端动态接口返回的菜单树
const menuList = computed(() => permissionStore.sidebarMenus);

const activeMenu = computed(() => {
  return route.path;
});
</script>

<style scoped>
.sidebar-container {
  height: 100%;
  background-color: #304156;
  display: flex;
  flex-direction: column;
}
.logo-box {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background-color: #2b3648;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
}
.el-menu {
  border-right: none;
}
</style>
