<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="width"
    :before-close="handleBeforeClose"
    :close-on-click-modal="false"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading">
      <slot />
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button :disabled="loading || confirmLoading" @click="handleCancel">取消</el-button>
        <el-button type="primary" :loading="confirmLoading" :disabled="loading || confirmLoading" @click="handleConfirm">
          确定
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    width?: string;
    loading?: boolean;
    confirmLoading?: boolean;
  }>(),
  {
    title: '提示',
    width: '600px',
    loading: false,
    confirmLoading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const handleConfirm = () => {
  if (props.loading || props.confirmLoading) return;
  emit('confirm');
};

const handleCancel = () => {
  if (props.loading || props.confirmLoading) return;
  visible.value = false;
  emit('cancel');
};

const handleBeforeClose = (done: () => void) => {
  if (props.loading || props.confirmLoading) return;
  emit('cancel');
  done();
};
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
