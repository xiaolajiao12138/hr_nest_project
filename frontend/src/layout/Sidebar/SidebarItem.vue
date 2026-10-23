<template>
  <div v-if="!item.meta?.hidden">
    <!-- 无子菜单的叶子节点，渲染为 el-menu-item -->
    <el-menu-item
      v-if="!item.children || item.children.length === 0"
      :index="item.path"
    >
      <el-icon v-if="item.meta?.icon">
        <component :is="item.meta.icon" />
      </el-icon>
      <template #title>
        <span class="menu-title-text">{{ item.meta?.title }}</span>
        <el-badge
          v-if="item.path === '/hr/leave' && pendingCount > 0"
          :value="pendingCount"
          :max="99"
          class="menu-badge"
        />
      </template>
    </el-menu-item>

    <!-- 拥有子菜单的目录节点，渲染为 el-sub-menu -->
    <el-sub-menu v-else :index="item.path">
      <template #title>
        <el-icon v-if="item.meta?.icon">
          <component :is="item.meta.icon" />
        </el-icon>
        <span>{{ item.meta?.title }}</span>
      </template>

      <!-- 递归渲染子项 -->
      <sidebar-item
        v-for="child in item.children"
        :key="child.path"
        :item="child"
      />
    </el-sub-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNotifyStore } from '@/stores/notify';

defineProps<{
  item: any;
}>();

const notifyStore = useNotifyStore();
const pendingCount = computed(() => notifyStore.pendingLeaveCount);
</script>

<style scoped>
.menu-title-text {
  margin-right: 8px;
}
:deep(.menu-badge .el-badge__content) {
  top: 0;
  right: -6px;
}
</style>
