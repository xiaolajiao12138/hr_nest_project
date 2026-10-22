<template>
  <div v-if="!item.meta?.hidden">
    <!-- 仅有单个子项或无子项的叶子菜单 -->
    <template
      v-if="
        hasOneShowingChild(item.children, item) &&
        (!onlyOneChild.children || onlyOneChild.noShowingChildren) &&
        !item.alwaysShow
      "
    >
      <el-menu-item :index="resolvePath(onlyOneChild.path)">
        <el-icon v-if="onlyOneChild.meta?.icon || item.meta?.icon">
          <component :is="onlyOneChild.meta?.icon || item.meta?.icon" />
        </el-icon>
        <template #title>
          <span>{{ onlyOneChild.meta?.title || item.meta?.title }}</span>
        </template>
      </el-menu-item>
    </template>

    <!-- 具有多个子项的嵌套目录 -->
    <el-sub-menu v-else :index="resolvePath(item.path)">
      <template #title>
        <el-icon v-if="item.meta?.icon">
          <component :is="item.meta.icon" />
        </el-icon>
        <span>{{ item.meta?.title }}</span>
      </template>

      <!-- 递归子节点 -->
      <sidebar-item
        v-for="child in item.children"
        :key="child.path"
        :item="child"
        :base-path="resolvePath(item.path)"
      />
    </el-sub-menu>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    item: any;
    basePath?: string;
  }>(),
  {
    basePath: '',
  },
);

const onlyOneChild = ref<any>(null);

const hasOneShowingChild = (children: any[] = [], parent: any) => {
  const showingChildren = children.filter((item) => {
    if (item.meta?.hidden) {
      return false;
    }
    onlyOneChild.value = item;
    return true;
  });

  if (showingChildren.length === 1 && parent.component !== 'Layout') {
    return true;
  }

  if (showingChildren.length === 0) {
    onlyOneChild.value = { ...parent, noShowingChildren: true };
    return true;
  }

  return false;
};

const resolvePath = (routePath: string) => {
  if (routePath.startsWith('/')) {
    return routePath;
  }
  return `${props.basePath}/${routePath}`.replace(/\/+/g, '/');
};
</script>
