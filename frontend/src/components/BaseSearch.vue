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

/**
 * 通用检索过滤栏组件 Props
 * @property model 表单双向绑定的筛选数据实体对象
 */
const props = defineProps<{
  model: Record<string, any>;
}>();

/**
 * 检索栏事件派发器
 * @emits search 点击“查询”按钮触发
 * @emits reset 点击“重置”按钮触发（已自动执行 resetFields）
 */
const emit = defineEmits<{
  (e: 'search'): void;
  (e: 'reset'): void;
}>();

/** 底层 el-form 实例引用 */
const formRef = ref();

/**
 * 执行检索查询
 */
const handleSearch = () => {
  emit('search');
};

/**
 * 重置表单所有字段并派发重置事件
 */
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
