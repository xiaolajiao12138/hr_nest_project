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

      <template #action="{ row }">
        <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
        <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
      </template>
    </BaseTable>

    <!-- 新增/编辑字典弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
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
          <el-input-number v-model="formData.sort" :min="0" :max="999" />
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
import { usePagination } from '@/hooks/usePagination';
import {
  getDictListApi,
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
  { prop: 'dictName', label: '字典名称', width: 150 },
  { prop: 'dictType', label: '字典类型', width: 160 },
  { prop: 'dictLabel', label: '字典标签(显示名)', width: 150 },
  { prop: 'dictValue', label: '字典键值', width: 140 },
  { prop: 'sort', label: '显示排序', width: 90 },
  { prop: 'status', label: '状态', width: 90, formatter: (val) => (val === 1 ? '正常' : '停用') },
];

const dialogVisible = ref(false);
const dialogTitle = ref('新增字典');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  dictName: '',
  dictType: '',
  dictLabel: '',
  dictValue: '',
  sort: 0,
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
  });
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑字典项';
  Object.assign(formData, {
    dictName: row.dictName,
    dictType: row.dictType,
    dictLabel: row.dictLabel,
    dictValue: row.dictValue,
    sort: row.sort,
  });
  dialogVisible.value = true;
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
