<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="620px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <div class="import-container">
      <!-- 模板下载提示区 -->
      <div class="template-box">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="导入须知：请先下载标准模板，按要求填写数据后上传。系统将逐行校验，若有任意一行数据不符合规则，整批数据将全部回滚不予入库。"
        />
        <div class="download-btn-row">
          <el-button type="primary" link :icon="Download" @click="handleDownloadTemplate">
            下载《{{ templateName || '数据导入模板' }}》
          </el-button>
        </div>
      </div>

      <!-- 文件拖拽上传区 -->
      <el-upload
        ref="uploadRef"
        drag
        action=""
        :auto-upload="false"
        :limit="1"
        :accept="'.xlsx, .xls'"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          将 Excel 文件拖到此处，或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">仅支持 xlsx / xls 格式文件，单文件不超过 10MB</div>
        </template>
      </el-upload>

      <!-- 校验失败错误行号及原因列表展示卡片 -->
      <div v-if="errorList.length > 0" class="error-panel">
        <div class="error-title">
          <el-icon color="#F56C6C"><WarningFilled /></el-icon>
          <span>校验未通过，发现 {{ errorList.length }} 处错误，数据已全部撤销未保存：</span>
        </div>
        <el-scrollbar max-height="200px">
          <ul class="error-list">
            <li v-for="(err, idx) in errorList" :key="idx" class="error-item">
              <el-tag size="small" type="danger">第 {{ err.row }} 行</el-tag>
              <span class="err-text">{{ err.message }}</span>
            </li>
          </ul>
        </el-scrollbar>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile"
          @click="submitUpload"
        >
          开始校验并导入
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { UploadFilled, Download, WarningFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    templateName?: string;
    downloadApi?: () => Promise<any>;
    uploadApi?: (formData: FormData) => Promise<any>;
  }>(),
  {
    title: 'Excel 批量导入',
    templateName: '标准导入模板',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'success'): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const errorList = ref<{ row: number; field: string; message: string }[]>([]);

// 监听文件变动
const handleFileChange = (uploadFile: any) => {
  selectedFile.value = uploadFile.raw;
  errorList.value = [];
};

const handleFileRemove = () => {
  selectedFile.value = null;
  errorList.value = [];
};

// 下载模板
const handleDownloadTemplate = async () => {
  if (!props.downloadApi) {
    ElMessage.warning('未配置模板下载接口');
    return;
  }
  try {
    const res = await props.downloadApi();
    const blob = new Blob([res], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${props.templateName || '导入模板'}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (e: any) {
    ElMessage.error(e.message || '模板下载失败');
  }
};

// 提交上传
const submitUpload = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择要上传的 Excel 文件');
    return;
  }
  if (!props.uploadApi) {
    ElMessage.warning('未配置导入处理接口');
    return;
  }

  const formData = new FormData();
  formData.append('file', selectedFile.value);

  uploading.value = true;
  errorList.value = [];

  try {
    const res: any = await props.uploadApi(formData);
    if (res.success) {
      ElMessage.success(res.message || '数据全部校验通过并已成功入库！');
      visible.value = false;
      emit('success');
    } else {
      // 存在错误行号
      errorList.value = res.errors || [];
      ElMessage.error(res.message || '部分数据存在校验错误，导入失败');
    }
  } catch (e: any) {
    ElMessage.error(e.message || '导入异常');
  } finally {
    uploading.value = false;
  }
};
</script>

<style scoped>
.import-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.template-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.download-btn-row {
  display: flex;
  justify-content: flex-end;
}
.error-panel {
  border: 1px solid #fde2e2;
  background-color: #fef0f0;
  border-radius: 6px;
  padding: 12px;
}
.error-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: bold;
  color: #f56c6c;
  margin-bottom: 8px;
}
.error-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.error-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #606266;
  padding: 4px 0;
  border-bottom: 1px dashed #fcd3d3;
}
.err-text {
  color: #f56c6c;
}
</style>
