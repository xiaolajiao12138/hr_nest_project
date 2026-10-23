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

/**
 * 通用文件与图片上传组件 Props
 */
const props = withDefaults(
  defineProps<{
    /** 双向绑定的文件在数据库中的主键 ID (v-model) */
    modelValue?: number | string | null;
    /** 文件的完整可访问预览网络地址 (v-model:fileUrl) */
    fileUrl?: string;
    /** 文件原始名称展示 */
    fileName?: string;
    /** 上传存储分类二级目录名称，默认为 'common' */
    folder?: string;
    /** 文件最大限制体积 (MB)，默认为 20MB */
    maxSizeMB?: number;
    /** 允许上传的文件后缀扩展名白名单 */
    acceptExtensions?: string[];
    /** 未上传时的居中提示文案 */
    tipText?: string;
    /** 是否禁用上传与删除交互 */
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

/**
 * BaseUpload 事件派发器
 */
const emit = defineEmits<{
  /** 绑定的文件 ID 变更 */
  (e: 'update:modelValue', fileId: number | null): void;
  /** 绑定的文件预览 URL 变更 */
  (e: 'update:fileUrl', url: string): void;
  /** 文件变更全量实体回调 */
  (e: 'change', fileData: any): void;
}>();

/** 服务端文件上传接口地址 */
const uploadUrl = `${import.meta.env.VITE_API_PREFIX || '/api'}/upload/file`;

/** 携带 JWT Bearer Token 的请求头计算属性 */
const headers = computed(() => ({
  Authorization: `Bearer ${getToken()}`,
}));

/** 弹窗大图/PDF 预览对话框可见性 */
const previewDialogVisible = ref(false);

/** 判断当前已上传文件是否为图片类型 */
const isImage = computed(() => {
  if (!props.fileUrl) return false;
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(props.fileUrl);
});

/**
 * 文件上传前客户端白名单与体积强校验
 *
 * @param rawFile 待上传的原生 File 对象
 * @returns 校验通过返回 true，不通过抛出提示并返回 false 阻断上传
 */
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

/**
 * 文件上传成功回调处理
 * 解包服务端返回数据，向父组件同步更新文件 ID、文件 URL
 *
 * @param res 服务端响应 JSON
 */
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

/**
 * 文件上传网络或服务异常回调
 */
const handleError = () => {
  ElMessage.error('网络异常，文件上传失败');
};

/**
 * 移除已上传的文件，清空各绑定值
 */
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
