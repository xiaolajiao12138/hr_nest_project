<template>
  <div class="dict-page">
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="字典类型/名称/标签"
          clearable
          style="width: 200px"
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
          v-hasPerm="['ops:dict:list']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增字典项
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增/编辑字典弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="520px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <div v-loading="detailLoading">
        <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
          <el-form-item label="字典名称" prop="dictName">
            <el-input v-model="formData.dictName" placeholder="例如 请假类型" />
          </el-form-item>
          <el-form-item label="字典类型" prop="dictType">
            <el-input v-model="formData.dictType" placeholder="例如 leave_type" />
          </el-form-item>
          <el-form-item label="字典标签" prop="dictLabel">
            <el-input v-model="formData.dictLabel" placeholder="例如 年假" />
          </el-form-item>
          <el-form-item label="字典键值" prop="dictValue">
            <el-input v-model="formData.dictValue" placeholder="例如 ANNUAL" />
          </el-form-item>
          <el-form-item label="显示排序" prop="sort">
            <el-input-number v-model="formData.sort" :min="0" :max="999" style="width: 150px" />
          </el-form-item>
          <el-form-item label="字典状态" prop="status">
            <el-radio-group v-model="formData.status">
              <el-radio :label="1">正常</el-radio>
              <el-radio :label="0">停用</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="备注说明" prop="remark">
            <el-input
              v-model="formData.remark"
              type="textarea"
              :rows="2"
              placeholder="请输入备注说明（选填）"
            />
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance, ElTag } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/utils/date';
import {
  getDictListApi,
  getDictDetailApi,
  createDictApi,
  updateDictApi,
  deleteDictApi,
} from '@/api/ops';

const loading = ref(false);
const tableData = ref<any[]>([]);
const searchForm = reactive({ keyword: '' });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'dictName', label: '字典名称', minWidth: 140 },
  {
    prop: 'dictType',
    label: '字典类型',
    minWidth: 150,
    render: ({ row }) =>
      h(
        ElTag,
        { size: 'small', type: 'info', effect: 'plain' },
        () => row.dictType,
      ),
  },
  { prop: 'dictLabel', label: '字典标签(显示名)', minWidth: 140 },
  {
    prop: 'dictValue',
    label: '字典键值',
    minWidth: 120,
    render: ({ row }) =>
      h(
        'code',
        {
          style: {
            backgroundColor: '#f1f5f9',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#334155',
          },
        },
        row.dictValue,
      ),
  },
  { prop: 'sort', label: '显示排序', width: 90 },
  {
    prop: 'status',
    label: '状态',
    width: 90,
    render: ({ row }) =>
      h(
        ElTag,
        { type: row.status === 1 ? 'success' : 'danger', size: 'small' },
        () => (row.status === 1 ? '正常' : '停用'),
      ),
  },
  {
    prop: 'remark',
    label: '备注说明',
    minWidth: 160,
    formatter: (val) => val || '-',
  },
  {
    prop: 'createdAt',
    label: '创建时间',
    width: 175,
    formatter: (val) => formatDateTime(val) || '-',
  },
];

// 企业级操作列配置 (通过 actionColumn 集中驱动)
const actionColumn: ActionColumnConfig = {
  label: '操作',
  width: 140,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '编辑',
      type: 'primary',
      onClick: () => handleEdit(row),
    },
    {
      label: '删除',
      type: 'danger',
      onClick: () => handleDelete(row),
    },
  ],
};

const dialogVisible = ref(false);
const dialogTitle = ref('新增字典');
const submitLoading = ref(false);
const detailLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  dictName: '',
  dictType: '',
  dictLabel: '',
  dictValue: '',
  sort: 0,
  status: 1,
  remark: '',
});

const formRules = {
  dictName: [{ required: true, message: '字典名称不能为空', trigger: 'blur' }],
  dictType: [{ required: true, message: '字典类型不能为空', trigger: 'blur' }],
  dictLabel: [{ required: true, message: '字典标签不能为空', trigger: 'blur' }],
  dictValue: [{ required: true, message: '字典键值不能为空', trigger: 'blur' }],
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getDictListApi({
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
  dialogTitle.value = '新增字典项';
  Object.assign(formData, {
    dictName: '',
    dictType: '',
    dictLabel: '',
    dictValue: '',
    sort: 0,
    status: 1,
    remark: '',
  });
  dialogVisible.value = true;
};

const handleEdit = async (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑字典项';
  dialogVisible.value = true;
  detailLoading.value = true;

  try {
    const res: any = await getDictDetailApi(row.id);
    Object.assign(formData, {
      dictName: res.dictName || '',
      dictType: res.dictType || '',
      dictLabel: res.dictLabel || '',
      dictValue: res.dictValue || '',
      sort: res.sort ?? 0,
      status: res.status ?? 1,
      remark: res.remark || '',
    });
  } catch (error: any) {
    ElMessage.error(error?.message || '获取字典详情失败');
    dialogVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除字典【${row.dictLabel}】吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteDictApi(row.id);
    ElMessage.success('字典项删除成功');
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
        await updateDictApi(currentId.value, formData);
        ElMessage.success('字典更新成功');
      } else {
        await createDictApi(formData);
        ElMessage.success('字典新增成功');
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
