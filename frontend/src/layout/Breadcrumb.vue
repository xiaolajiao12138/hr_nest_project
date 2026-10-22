<template>
  <el-breadcrumb separator="/">
    <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
    <el-breadcrumb-item v-for="(item, index) in breadcrumbs" :key="index">
      {{ item.meta?.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, RouteLocationMatched } from 'vue-router';

const route = useRoute();
const breadcrumbs = ref<RouteLocationMatched[]>([]);

const getBreadcrumbs = () => {
  const matched = route.matched.filter(
    (item) => item.meta && item.meta.title && item.meta.title !== '工作台',
  );
  breadcrumbs.value = matched;
};

watch(
  () => route.path,
  () => getBreadcrumbs(),
  { immediate: true },
);
</script>
