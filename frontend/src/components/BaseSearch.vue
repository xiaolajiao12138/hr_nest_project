<template>
  <div class="base-search-container">
    <el-form ref="formRef" :model="model" inline>
      <slot />

      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleSearch">
          查询
        </el-button>
        <el-button :icon="Refresh" @click="handleReset">
          重置
        </el-button>
        <slot name="extra" />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Search, Refresh } from '@element-plus/icons-vue';

const props = defineProps<{
  model: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'reset'): void;
}>();

const formRef = ref();

const handleSearch = () => {
  emit('search');
};

const handleReset = () => {
  if (formRef.value) {
    formRef.value.resetFields();
  }
  emit('reset');
};
</script>

<style scoped>
.base-search-container {
  background-color: #fff;
  border-radius: 6px;
  padding: 16px 16px 0 16px;
  margin-bottom: 16px;
}
</style>
