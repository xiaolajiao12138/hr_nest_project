<template>
  <span class="sensitive-text-wrapper" :class="{ 'is-revealed': isRevealed }">
    <span class="text-content" :title="isRevealed ? displayValue : '点击小眼睛查看明文'">
      {{ displayValue }}
    </span>

    <!-- 明密文切换小眼睛按钮 -->
    <el-tooltip
      v-if="showToggle && value && value !== '-'"
      :content="isRevealed ? '隐藏明文' : '点击查看明文'"
      placement="top"
      :show-after="300"
    >
      <span class="action-btn eye-btn" @click.stop="toggleReveal">
        <el-icon v-if="!isRevealed"><View /></el-icon>
        <el-icon v-else><Hide /></el-icon>
      </span>
    </el-tooltip>

    <!-- 复制按钮 -->
    <el-tooltip
      v-if="allowCopy && value && value !== '-'"
      content="复制到剪贴板"
      placement="top"
      :show-after="300"
    >
      <span class="action-btn copy-btn" @click.stop="handleCopy">
        <el-icon><CopyDocument /></el-icon>
      </span>
    </el-tooltip>
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { View, Hide, CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { formatSensitive, type SensitiveType } from '@/utils/mask';

const props = withDefaults(
  defineProps<{
    value?: string | number | null;
    type?: SensitiveType;
    showToggle?: boolean;
    allowCopy?: boolean;
  }>(),
  {
    value: '',
    type: 'custom',
    showToggle: true,
    allowCopy: true,
  }
);

/** 当前是否处于明文展开状态 */
const isRevealed = ref(false);

const strValue = computed(() => (props.value !== undefined && props.value !== null ? String(props.value).trim() : ''));

/** 显示内容计算 */
const displayValue = computed(() => {
  if (!strValue.value) return '-';
  if (isRevealed.value) return strValue.value;
  return formatSensitive(strValue.value, props.type);
});

/** 切换明文/密文 */
const toggleReveal = () => {
  isRevealed.value = !isRevealed.value;
};

/** 复制当前展示内容 */
const handleCopy = async () => {
  if (!strValue.value) return;
  try {
    const textToCopy = isRevealed.value ? strValue.value : displayValue.value;
    await navigator.clipboard.writeText(textToCopy);
    ElMessage.success(isRevealed.value ? '已复制明文' : '已复制脱敏文本');
  } catch (err) {
    ElMessage.warning('复制失败，请手动选择复制');
  }
};
</script>

<style scoped>
.sensitive-text-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

.text-content {
  letter-spacing: 0.5px;
  user-select: text;
}

.is-revealed .text-content {
  color: var(--el-color-primary, #409eff);
  font-weight: 500;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
  color: #909399;
  font-size: 13px;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background-color: #f2f3f5;
  color: var(--el-color-primary, #409eff);
  transform: scale(1.1);
}

.copy-btn {
  font-size: 12px;
}
</style>
