<template>
  <div class="not-found-container">
    <el-result
      icon="warning"
      title="404 - 页面未找到"
      sub-title="您访问的页面不存在或没有权限查看，请联系系统管理员"
    >
      <template #extra>
        <el-button type="primary" @click="$router.push('/dashboard')">
          返回工作台首页
        </el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.not-found-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
