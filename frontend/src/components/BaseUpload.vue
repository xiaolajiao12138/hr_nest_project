<template>
  <div class="base-upload-container">
    <el-upload
      ref="uploadRef"
      :action="uploadUrl"
      :headers="headers"
      :data="{ folder }"
      :show-file-list="false"
      :before-upload="beforeUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
      :disabled="disabled"
    >
      <!-- 已有文件卡片预览 -->
      <div v-if="fileUrl" class="preview-box">
        <template v-if="isImage">
          <el-image
            :src="fileUrl"
            class="preview-image"
            fit="cover"
            :preview-src-list="[fileUrl]"
            preview-teleported
          />
        </template>
        <template v-else>
          <div class="file-icon-box">
            <el-icon :size="32"><Document /></el-icon>
            <span class="file-title">{{ fileName || '已上传文件' }}</span>
          </div>
        </template>

        <!-- 悬停遮罩操作 -->
        <div v-if="!disabled" class="preview-mask">
          <el-icon @click.stop="previewDialogVisible = true"><ZoomIn /></el-icon>
          <el-icon @click.stop="handleRemove"><Delete /></el-icon>
        </div>
      </div>

      <!-- 未上传时的上传触发区 -->
      <div v-else class="upload-trigger">
        <el-icon class="upload-icon"><Plus /></el-icon>
        <div class="upload-tip-text">{{ tipText || '点击上传' }}</div>
      </div>
    </el-upload>

    <!-- 格式与大小提示 -->
    <div class="el-upload__tip">
      仅支持 {{ acceptExtensions.join('/') }} 格式，大小不超过 {{ maxSizeMB }}MB
    </div>

    <!-- 弹窗大图预览 -->
    <el-dialog v-model="previewDialogVisible" title="文件预览" width="50%" append-to-body>
      <div style="text-align: center">
        <img v-if="isImage" :src="fileUrl" style="max-width: 100%; max-height: 500px" />
        <iframe v-else :src="fileUrl" style="width: 100%; height: 500px; border: none" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Plus, ZoomIn, Delete, Document } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getToken } from '@/utils/auth';

const props = withDefaults(
  defineProps<{
    modelValue?: number | string | null;
    fileUrl?: string;
    fileName?: string;
    folder?: string;
    maxSizeMB?: number;
    acceptExtensions?: string[];
    tipText?: string;
    disabled?: boolean;
  }>(),
  {
    folder: 'common',
    maxSizeMB: 20,
    acceptExtensions: () => ['.png', '.jpg', '.jpeg', '.pdf', '.docx', '.xlsx'],
    tipText: '点击上传文件',
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', fileId: number | null): void;
  (e: 'update:fileUrl', url: string): void;
  (e: 'change', fileData: any): void;
}>();

const uploadUrl = `${import.meta.env.VITE_API_PREFIX || '/api'}/upload/file`;
const headers = computed(() => ({
  Authorization: `Bearer ${getToken()}`,
}));

const previewDialogVisible = ref(false);

const isImage = computed(() => {
  if (!props.fileUrl) return false;
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(props.fileUrl);
});

// 上传前校验
const beforeUpload = (rawFile: File) => {
  const ext = (rawFile.name.substring(rawFile.name.lastIndexOf('.')) || '').toLowerCase();
  if (!props.acceptExtensions.includes(ext)) {
    ElMessage.error(`格式不正确！仅允许上传 ${props.acceptExtensions.join('、')} 格式`);
    return false;
  }

  const isLtSize = rawFile.size / 1024 / 1024 < props.maxSizeMB;
  if (!isLtSize) {
    ElMessage.error(`上传文件大小不能超过 ${props.maxSizeMB}MB!`);
    return false;
  }

  return true;
};

// 上传成功
const handleSuccess = (res: any) => {
  if (res.code === 200) {
    ElMessage.success('上传成功');
    emit('update:modelValue', res.data.id);
    emit('update:fileUrl', res.data.fileUrl);
    emit('change', res.data);
  } else {
    ElMessage.error(res.msg || '上传失败');
  }
};

// 上传失败
const handleError = () => {
  ElMessage.error('网络异常，文件上传失败');
};

// 删除文件
const handleRemove = () => {
  emit('update:modelValue', null);
  emit('update:fileUrl', '');
  emit('change', null);
};
</script>

<style scoped>
.base-upload-container {
  display: inline-block;
}
.preview-box {
  width: 130px;
  height: 130px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  border: 1px solid #dcdfe6;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #fafafa;
}
.preview-image {
  width: 100%;
  height: 100%;
}
.file-icon-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #409eff;
}
.file-title {
  font-size: 12px;
  color: #606266;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  color: #fff;
  font-size: 20px;
  opacity: 0;
  transition: opacity 0.25s ease;
  cursor: pointer;
}
.preview-box:hover .preview-mask {
  opacity: 1;
}
.upload-trigger {
  width: 130px;
  height: 130px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  background-color: #fbfdff;
  cursor: pointer;
  transition: border-color 0.2s;
}
.upload-trigger:hover {
  border-color: #409eff;
}
.upload-icon {
  font-size: 26px;
  color: #8c939d;
}
.upload-tip-text {
  font-size: 12px;
  color: #606266;
}
.el-upload__tip {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}
</style>
