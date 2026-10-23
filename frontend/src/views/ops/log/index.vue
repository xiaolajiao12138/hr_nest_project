<template>
  <div class="log-page">
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="操作人员/模块/URL"
          clearable
          style="width: 220px"
        />
      </el-form-item>
    </BaseSearch>

    <BaseTable
      :loading="loading"
      :data="tableData"
      :columns="columns"
      :action-column="actionColumn"
      :pagination="pagination"
      @page-change="handlePageChange"
      @size-change="handleSizeChange"
    >
      <template #toolbar>
        <el-button
          v-hasPerm="['ops:log:list']"
          type="danger"
          plain
          @click="handleClean"
        >
          清空所有日志
        </el-button>
      </template>
    </BaseTable>

    <!-- 日志详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      title="操作日志详情"
      width="700px"
      top="7vh"
      destroy-on-close
      append-to-body
    >
      <div v-loading="detailLoading" style="min-height: 200px">
        <el-scrollbar max-height="65vh" class="detail-scrollbar">
          <el-descriptions v-if="currentLog" :column="1" border class="log-detail-desc">
            <el-descriptions-item label="模块标题">{{ currentLog.title }}</el-descriptions-item>
            <el-descriptions-item label="请求方式">
              <el-tag size="small" effect="plain">{{ currentLog.requestMethod }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="操作人员">{{ currentLog.operName }} (IP: {{ currentLog.operIp }})</el-descriptions-item>
            <el-descriptions-item label="请求地址">{{ currentLog.operUrl }}</el-descriptions-item>
            <el-descriptions-item label="调用方法">{{ currentLog.method }}</el-descriptions-item>
            <el-descriptions-item label="请求入参">
              <pre class="json-code">{{ currentLog.operParam || '-' }}</pre>
            </el-descriptions-item>
            <el-descriptions-item label="返回结果">
              <pre class="json-code">{{ currentLog.jsonResult || '-' }}</pre>
            </el-descriptions-item>
            <el-descriptions-item v-if="currentLog.errorMsg" label="错误信息">
              <span style="color: #f56c6c; word-break: break-all">{{ currentLog.errorMsg }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="耗时 / 时间">
              {{ currentLog.costTime }} ms / {{ formatDateTime(currentLog.operTime) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-scrollbar>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailVisible = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox, ElTag } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import { usePagination } from '@/hooks/usePagination';
import { getLogListApi, getLogDetailApi, cleanLogApi } from '@/api/ops';
import { formatDateTime } from '@/utils/date';

const loading = ref(false);
const tableData = ref<any[]>([]);
const searchForm = reactive({ keyword: '' });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'title', label: '系统模块', width: 140 },
  { prop: 'operName', label: '操作人员', width: 120 },
  { prop: 'operIp', label: 'IP地址', width: 130 },
  { prop: 'operUrl', label: '请求URL', minWidth: 200 },
  {
    prop: 'costTime',
    label: '耗时',
    width: 100,
    render: ({ row }) => h(ElTag, { size: 'small', type: 'info' }, () => `${row.costTime} ms`),
  },
  {
    prop: 'status',
    label: '状态',
    width: 90,
    render: ({ row }) =>
      h(
        ElTag,
        { type: row.status === 1 ? 'success' : 'danger', size: 'small' },
        () => (row.status === 1 ? '成功' : '异常'),
      ),
  },
  {
    prop: 'operTime',
    label: '操作时间',
    width: 175,
    formatter: (val) => formatDateTime(val) || '-',
  },
];

// 企业级操作列配置 (通过 actionColumn 集中驱动)
const actionColumn: ActionColumnConfig = {
  label: '操作',
  width: 100,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '详情',
      type: 'primary',
      onClick: () => viewDetail(row),
    },
  ],
};

const detailVisible = ref(false);
const detailLoading = ref(false);
const currentLog = ref<any>(null);

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getLogListApi({
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

const viewDetail = async (row: any) => {
  currentLog.value = null;
  detailVisible.value = true;
  detailLoading.value = true;

  try {
    const res: any = await getLogDetailApi(row.id);
    currentLog.value = res;
  } catch (error: any) {
    ElMessage.error(error?.message || '获取操作日志详情失败');
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const handleClean = () => {
  ElMessageBox.confirm('确定清空所有操作审计日志吗？此操作不可撤回。', '高危警告', {
    confirmButtonText: '确定清空',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await cleanLogApi();
    ElMessage.success('操作日志已清空');
    fetchData();
  });
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.detail-scrollbar {
  padding-right: 8px;
}

.log-detail-desc :deep(.el-descriptions__label) {
  width: 100px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.json-code {
  max-height: 220px;
  overflow-y: auto;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #334155;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
