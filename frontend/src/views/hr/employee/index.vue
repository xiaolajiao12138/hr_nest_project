<template>
  <div class="employee-page">
    <!-- 搜索栏 -->
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="工号/姓名/手机号"
          clearable
          style="width: 180px"
        />
      </el-form-item>
      <el-form-item label="所属部门" prop="deptId">
        <el-tree-select
          v-model="searchForm.deptId"
          :data="deptTree"
          :props="{ label: 'deptName', value: 'id', children: 'children' }"
          check-strictly
          placeholder="全部部门"
          clearable
          style="width: 180px"
        />
      </el-form-item>
      <el-form-item label="在职状态" prop="status">
        <el-select
          v-model="searchForm.status"
          placeholder="全部状态"
          clearable
          style="width: 130px"
        >
          <el-option label="在职" :value="1" />
          <el-option label="离职" :value="2" />
          <el-option label="试用期" :value="3" />
        </el-select>
      </el-form-item>
    </BaseSearch>

    <!-- 基础通用表格组件 -->
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
          v-hasPerm="['hr:employee:add']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增员工
        </el-button>
        <el-button
          v-hasPerm="['hr:employee:import']"
          type="success"
          :icon="Upload"
          @click="importDialogVisible = true"
        >
          Excel批量导入
        </el-button>
        <el-button
          v-hasPerm="['hr:employee:export']"
          type="warning"
          :icon="Download"
          :loading="exportLoading"
          @click="handleExport"
        >
          流式分页导出
        </el-button>
      </template>

      <!-- 员工姓名与工号插槽 -->
      <template #nameSlot="{ row }">
        <div class="emp-name-box">
          <span class="emp-name">{{ row.name }}</span>
          <el-tag size="small" type="info">{{ row.empNo }}</el-tag>
        </div>
      </template>

      <!-- 部门插槽 -->
      <template #deptSlot="{ row }">
        <span>{{ row.dept?.deptName || '-' }}</span>
      </template>

      <!-- 状态插槽 -->
      <template #statusSlot="{ row }">
        <el-tag
          :type="
            row.status === 1 ? 'success' : row.status === 2 ? 'info' : 'warning'
          "
        >
          {{ row.status === 1 ? '在职' : row.status === 2 ? '离职' : '试用期' }}
        </el-tag>
      </template>

      <!-- 附件预览插槽 -->
      <template #attachmentsSlot="{ row }">
        <div class="attachment-tags">
          <el-tag
            v-if="row.idCardFront"
            size="small"
            class="clickable"
            @click="previewFile(row.idCardFront.fileUrl)"
          >
            身份证正面
          </el-tag>
          <el-tag
            v-if="row.idCardBack"
            size="small"
            class="clickable"
            @click="previewFile(row.idCardBack.fileUrl)"
          >
            身份证背面
          </el-tag>
          <el-tag
            v-if="row.eduCert"
            size="small"
            type="warning"
            class="clickable"
            @click="previewFile(row.eduCert.fileUrl)"
          >
            学历证明
          </el-tag>
          <span v-if="!row.idCardFront && !row.idCardBack && !row.eduCert">-</span>
        </div>
      </template>

      <!-- 操作列插槽 -->
      <template #action="{ row }">
        <el-button
          v-hasPerm="['hr:employee:edit']"
          type="primary"
          link
          @click="handleEdit(row)"
        >
          编辑
        </el-button>
        <el-button
          v-hasPerm="['hr:employee:delete']"
          type="danger"
          link
          @click="handleDelete(row)"
        >
          删除
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑员工档案弹窗 (复用 BaseDialog 与 BaseUpload) -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="780px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="工号" prop="empNo">
              <el-input
                v-model="formData.empNo"
                placeholder="例如 EMP2026001"
                :disabled="!!currentId"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="formData.name" placeholder="请输入员工姓名" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="formData.gender">
                <el-radio label="男">男</el-radio>
                <el-radio label="女">女</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机号码" prop="phone">
              <el-input
                v-model="formData.phone"
                placeholder="请输入11位手机号"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="身份证号" prop="idCard">
              <el-input
                v-model="formData.idCard"
                placeholder="请输入18位身份证号"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属部门" prop="deptId">
              <el-tree-select
                v-model="formData.deptId"
                :data="deptTree"
                :props="{
                  label: 'deptName',
                  value: 'id',
                  children: 'children',
                }"
                check-strictly
                placeholder="请选择所属部门"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="岗位职位" prop="post">
              <el-input v-model="formData.post" placeholder="例如 后端工程师" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期" prop="entryDate">
              <el-date-picker
                v-model="formData.entryDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择入职日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="最高学历" prop="education">
              <el-select
                v-model="formData.education"
                placeholder="请选择学历"
                style="width: 100%"
              >
                <el-option label="大专" value="大专" />
                <el-option label="本科" value="本科" />
                <el-option label="硕士" value="硕士" />
                <el-option label="博士" value="博士" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="基本薪资" prop="salary">
              <el-input-number
                v-model="formData.salary"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">证件与学历附件上传 (MinIO存储)</el-divider>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="身份证正面" label-width="90px">
              <BaseUpload
                v-model="formData.idCardFrontId"
                v-model:file-url="frontUrl"
                folder="idcard"
                tip-text="身份证人像面"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="身份证背面" label-width="90px">
              <BaseUpload
                v-model="formData.idCardBackId"
                v-model:file-url="backUrl"
                folder="idcard"
                tip-text="身份证国徽面"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="学历证明" label-width="90px">
              <BaseUpload
                v-model="formData.eduCertId"
                v-model:file-url="certUrl"
                folder="cert"
                tip-text="毕业证书/学籍"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </BaseDialog>

    <!-- Excel 批量导入弹窗 (复用 BaseImportExcel) -->
    <BaseImportExcel
      v-model="importDialogVisible"
      title="批量导入员工档案"
      template-name="员工档案批量导入模板"
      :download-api="downloadTemplateApi"
      :upload-api="importEmployeeExcelApi"
      @success="fetchData"
    />

    <!-- 图片/文档预览弹窗 -->
    <el-dialog v-model="previewVisible" title="查看附件" width="50%" append-to-body>
      <div style="text-align: center">
        <img :src="currentPreviewUrl" style="max-width: 100%; max-height: 500px" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Plus, Upload, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import BaseTable, { TableColumn } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import BaseUpload from '@/components/BaseUpload.vue';
import BaseImportExcel from '@/components/BaseImportExcel.vue';
import { usePagination } from '@/hooks/usePagination';
import {
  getEmployeeListApi,
  createEmployeeApi,
  updateEmployeeApi,
  deleteEmployeeApi,
  downloadTemplateApi,
  importEmployeeExcelApi,
  exportEmployeeExcelApi,
} from '@/api/employee';
import { getDeptTreeApi } from '@/api/dept';

const loading = ref(false);
const exportLoading = ref(false);
const tableData = ref<any[]>([]);
const deptTree = ref<any[]>([]);

const searchForm = reactive({
  keyword: '',
  deptId: undefined as number | undefined,
  status: undefined as number | undefined,
});

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'name', label: '员工姓名', slot: 'nameSlot', width: 160 },
  { prop: 'gender', label: '性别', width: 80 },
  { prop: 'phone', label: '联系电话', width: 140 },
  { prop: 'idCard', label: '身份证号', width: 180 },
  { prop: 'dept', label: '部门', slot: 'deptSlot', width: 140 },
  { prop: 'post', label: '岗位', width: 140 },
  { prop: 'education', label: '学历', width: 100 },
  { prop: 'entryDate', label: '入职日期', width: 120 },
  { prop: 'status', label: '状态', slot: 'statusSlot', width: 100 },
  { prop: 'attachments', label: '档案附件', slot: 'attachmentsSlot', minWidth: 200 },
];

const dialogVisible = ref(false);
const dialogTitle = ref('新增员工');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const importDialogVisible = ref(false);

const frontUrl = ref('');
const backUrl = ref('');
const certUrl = ref('');

const previewVisible = ref(false);
const currentPreviewUrl = ref('');

const formData = reactive({
  empNo: '',
  name: '',
  gender: '男',
  phone: '',
  idCard: '',
  deptId: undefined as number | undefined,
  post: '',
  entryDate: '',
  education: '本科',
  salary: 0,
  status: 1,
  idCardFrontId: null as number | null,
  idCardBackId: null as number | null,
  eduCertId: null as number | null,
});

const formRules = {
  empNo: [{ required: true, message: '工号不能为空', trigger: 'blur' }],
  name: [{ required: true, message: '姓名不能为空', trigger: 'blur' }],
  phone: [{ required: true, message: '手机号不能为空', trigger: 'blur' }],
  idCard: [{ required: true, message: '身份证号不能为空', trigger: 'blur' }],
  deptId: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
  post: [{ required: true, message: '岗位不能为空', trigger: 'blur' }],
  entryDate: [{ required: true, message: '入职时间不能为空', trigger: 'change' }],
};

const fetchData = async () => {
  loading.value = true;
  try {
    const params = {
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
    const res: any = await getEmployeeListApi(params);
    tableData.value = res.list || [];
    pagination.total = res.total || 0;
  } finally {
    loading.value = false;
  }
};

const fetchDeptTree = async () => {
  const res: any = await getDeptTreeApi();
  deptTree.value = res || [];
};

const handleSearch = () => {
  resetPage();
  fetchData();
};

const handleReset = () => {
  searchForm.keyword = '';
  searchForm.deptId = undefined;
  searchForm.status = undefined;
  resetPage();
  fetchData();
};

const handleAdd = () => {
  currentId.value = null;
  dialogTitle.value = '新增员工档案';
  Object.assign(formData, {
    empNo: `EMP${Date.now().toString().slice(-4)}`,
    name: '',
    gender: '男',
    phone: '',
    idCard: '',
    deptId: undefined,
    post: '',
    entryDate: new Date().toISOString().split('T')[0],
    education: '本科',
    salary: 8000,
    status: 1,
    idCardFrontId: null,
    idCardBackId: null,
    eduCertId: null,
  });
  frontUrl.value = '';
  backUrl.value = '';
  certUrl.value = '';
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = `编辑员工【${row.name}】档案`;
  Object.assign(formData, {
    empNo: row.empNo,
    name: row.name,
    gender: row.gender,
    phone: row.phone,
    idCard: row.idCard,
    deptId: row.deptId,
    post: row.post,
    entryDate: row.entryDate,
    education: row.education,
    salary: row.salary,
    status: row.status,
    idCardFrontId: row.idCardFrontId,
    idCardBackId: row.idCardBackId,
    eduCertId: row.eduCertId,
  });
  frontUrl.value = row.idCardFront?.fileUrl || '';
  backUrl.value = row.idCardBack?.fileUrl || '';
  certUrl.value = row.eduCert?.fileUrl || '';
  dialogVisible.value = true;
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除员工【${row.name} (${row.empNo})】吗？`, '删除警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteEmployeeApi(row.id);
    ElMessage.success('员工档案删除成功');
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
        await updateEmployeeApi(currentId.value, formData);
        ElMessage.success('员工档案更新成功');
      } else {
        await createEmployeeApi(formData);
        ElMessage.success('员工档案创建成功，已事务初始化年假账户');
      }
      dialogVisible.value = false;
      fetchData();
    } finally {
      submitLoading.value = false;
    }
  });
};

// 导出 Excel
const handleExport = async () => {
  exportLoading.value = true;
  try {
    const res = await exportEmployeeExcelApi(searchForm);
    const blob = new Blob([res], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `员工档案_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    ElMessage.success('员工档案数据导出完成');
  } catch (e: any) {
    ElMessage.error(e.message || '导出失败');
  } finally {
    exportLoading.value = false;
  }
};

const previewFile = (url: string) => {
  currentPreviewUrl.value = url;
  previewVisible.value = true;
};

onMounted(() => {
  fetchData();
  fetchDeptTree();
});
</script>

<style scoped>
.emp-name-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.emp-name {
  font-weight: 500;
}
.attachment-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.clickable {
  cursor: pointer;
}
</style>
