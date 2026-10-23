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
        <span>{{ item.meta?.title }}</span>
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
defineProps<{
  item: any;
}>();
</script>
