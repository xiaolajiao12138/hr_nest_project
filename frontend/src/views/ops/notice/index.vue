<template>
  <div class="notice-page">
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="公告标题/内容"
          clearable
          style="width: 200px"
        />
      </el-form-item>
    </BaseSearch>

    <BaseTable
      :loading="loading"
      :data="tableData"
      :columns="columns"
      :pagination="pagination"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    >
      <template #toolbar>
        <el-button
          v-hasPerm="['ops:notice:list']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          发布公告
        </el-button>
      </template>

      <template #statusSlot="{ row }">
        <el-switch
          v-model="row.status"
          :active-value="1"
          :inactive-value="0"
          @change="changeNoticeStatus(row)"
        />
      </template>

      <template #action="{ row }">
        <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
        <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑公告弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="650px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
        <el-form-item label="公告标题" prop="title">
          <el-input v-model="formData.title" placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="公告类型" prop="noticeType">
          <el-radio-group v-model="formData.noticeType">
            <el-radio label="NOTICE">内部通知</el-radio>
            <el-radio label="ANNOUNCEMENT">全员公告</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="公告正文" prop="content">
          <el-input
            v-model="formData.content"
            type="textarea"
            :rows="5"
            placeholder="请输入正文内容"
          />
        </el-form-item>
        <el-form-item label="相关附件">
          <BaseUpload
            v-model="formData.fileId"
            v-model:file-url="attachmentUrl"
            folder="notice"
            tip-text="上传公告附件"
          />
        </el-form-item>
      </el-form>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import BaseTable, { TableColumn } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import BaseUpload from '@/components/BaseUpload.vue';
import { usePagination } from '@/hooks/usePagination';
import {
  getNoticeListApi,
  createNoticeApi,
  updateNoticeApi,
  changeNoticeStatusApi,
  deleteNoticeApi,
} from '@/api/ops';

const loading = ref(false);
const tableData = ref<any[]>([]);
const searchForm = reactive({ keyword: '' });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'title', label: '公告标题', minWidth: 200 },
  {
    prop: 'noticeType',
    label: '类型',
    width: 120,
    formatter: (val) => (val === 'ANNOUNCEMENT' ? '全员公告' : '内部通知'),
  },
  { prop: 'createdBy', label: '发布人', width: 120 },
  { prop: 'status', label: '发布状态', slot: 'statusSlot', width: 100 },
  { prop: 'createdAt', label: '发布时间', width: 170, formatter: (val) => val ? new Date(val).toLocaleString() : '-' },
];

const dialogVisible = ref(false);
const dialogTitle = ref('发布公告');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const attachmentUrl = ref('');

const formData = reactive({
  title: '',
  content: '',
  noticeType: 'NOTICE',
  fileId: null as number | null,
  status: 1,
});

const formRules = {
  title: [{ required: true, message: '公告标题不能为空', trigger: 'blur' }],
  content: [{ required: true, message: '公告内容不能为空', trigger: 'blur' }],
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getNoticeListApi({
      keyword: searchForm.keyword,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    tableData.value = res.list || [];
    pagination.total = res.total || 0;
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  resetPage();
  fetchData();
};

const handleReset = () => {
  searchForm.keyword = '';
  resetPage();
  fetchData();
};

const handleAdd = () => {
  currentId.value = null;
  dialogTitle.value = '发布系统公告';
  Object.assign(formData, {
    title: '',
    content: '',
    noticeType: 'NOTICE',
    fileId: null,
    status: 1,
  });
  attachmentUrl.value = '';
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑公告';
  Object.assign(formData, {
    title: row.title,
    content: row.content,
    noticeType: row.noticeType,
    fileId: row.fileId,
    status: row.status,
  });
  attachmentUrl.value = row.file?.fileUrl || '';
  dialogVisible.value = true;
};

const changeNoticeStatus = async (row: any) => {
  try {
    await changeNoticeStatusApi(row.id, row.status);
    ElMessage.success('公告状态已调整');
  } catch (e) {
    row.status = row.status === 1 ? 0 : 1;
  }
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除公告【${row.title}】吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteNoticeApi(row.id);
    ElMessage.success('公告删除成功');
    fetchData();
  });
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitLoading.value = true;
    try {
      if (currentId.value) {
        await updateNoticeApi(currentId.value, formData);
        ElMessage.success('公告更新成功');
      } else {
        await createNoticeApi(formData);
        ElMessage.success('公告发布成功');
      }
      dialogVisible.value = false;
      fetchData();
    } finally {
      submitLoading.value = false;
    }
  });
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped></style>
