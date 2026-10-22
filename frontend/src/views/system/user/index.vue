<template>
  <div class="user-page">
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="用户名/姓名/手机号"
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
          v-hasPerm="['system:user:add']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增用户
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑用户弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
        <el-form-item label="登录账号" prop="username">
          <el-input
            v-model="formData.username"
            placeholder="请输入登录用户名"
            :disabled="!!currentId"
          />
        </el-form-item>
        <el-form-item v-if="!currentId" label="登录密码" prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="请输入登录密码(最少6位)"
            show-password
          />
        </el-form-item>
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="formData.realName" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="formData.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="所属部门" prop="deptId">
          <el-tree-select
            v-model="formData.deptId"
            :data="deptTree"
            :props="{ label: 'deptName', value: 'id', children: 'children' }"
            check-strictly
            placeholder="请选择部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="分配角色" prop="roleIds">
          <el-select
            v-model="formData.roleIds"
            multiple
            placeholder="请分配角色"
            style="width: 100%"
          >
            <el-option
              v-for="role in allRoles"
              :key="role.id"
              :label="role.roleName"
              :value="role.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance, ElTag, ElSwitch } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import { usePagination } from '@/hooks/usePagination';
import {
  getUserListApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  resetPasswordApi,
  changeUserStatusApi,
  getAllRolesApi,
} from '@/api/system';
import { getDeptTreeApi } from '@/api/dept';

const loading = ref(false);
const tableData = ref<any[]>([]);
const allRoles = ref<any[]>([]);
const deptTree = ref<any[]>([]);

const searchForm = reactive({ keyword: '' });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'username', label: '账号', width: 130 },
  { prop: 'realName', label: '姓名', width: 130 },
  { prop: 'phone', label: '手机号', width: 140 },
  { prop: 'dept', label: '所属部门', width: 140, formatter: (val) => val?.deptName || '-' },
  {
    prop: 'roles',
    label: '分配角色',
    minWidth: 160,
    render: ({ row }) => {
      if (!row.roles || row.roles.length === 0) return '-';
      return h(
        'div',
        { style: 'display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;' },
        row.roles.map((r: any) =>
          h(ElTag, { key: r.id, size: 'small', type: 'success' }, () => r.roleName),
        ),
      );
    },
  },
  {
    prop: 'status',
    label: '启用状态',
    width: 110,
    render: ({ row }) =>
      h(ElSwitch, {
        modelValue: row.status,
        'onUpdate:modelValue': (val: any) => {
          row.status = val;
        },
        activeValue: 1,
        inactiveValue: 0,
        disabled: row.username === 'admin',
        beforeChange: () => handleBeforeStatusChange(row),
      }),
  },
  {
    prop: 'createdAt',
    label: '创建时间',
    width: 170,
    formatter: (val) => (val ? new Date(val).toLocaleString() : '-'),
  },
];

// 企业级操作列配置 (通过 actionColumn 集中驱动，支持权限自动校验与防误删)
const actionColumn: ActionColumnConfig = {
  label: '操作',
  width: 200,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '编辑',
      type: 'primary',
      perm: ['system:user:edit'],
      onClick: () => handleEdit(row),
    },
    {
      label: '重置密码',
      type: 'warning',
      perm: ['system:user:resetPwd'],
      onClick: () => handleResetPwd(row),
    },
    {
      label: '删除',
      type: 'danger',
      perm: ['system:user:delete'],
      show: row.username !== 'admin', // 超级管理员直接隐藏删除按钮，增加安全防线
      onClick: () => handleDelete(row),
    },
  ],
};

const dialogVisible = ref(false);
const dialogTitle = ref('新增用户');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  username: '',
  password: '',
  realName: '',
  phone: '',
  deptId: undefined as number | undefined,
  roleIds: [] as number[],
});

const formRules = {
  username: [{ required: true, message: '账号不能为空', trigger: 'blur' }],
  password: [{ required: true, message: '密码不能为空', trigger: 'blur' }],
  realName: [{ required: true, message: '真实姓名不能为空', trigger: 'blur' }],
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getUserListApi({
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

const fetchOptions = async () => {
  const [roleRes, deptRes]: any = await Promise.all([
    getAllRolesApi(),
    getDeptTreeApi(),
  ]);
  allRoles.value = roleRes || [];
  deptTree.value = deptRes || [];
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
  dialogTitle.value = '新增用户';
  Object.assign(formData, {
    username: '',
    password: 'hr_password_2026',
    realName: '',
    phone: '',
    deptId: undefined,
    roleIds: [],
  });
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑用户';
  Object.assign(formData, {
    username: row.username,
    realName: row.realName,
    phone: row.phone,
    deptId: row.deptId,
    roleIds: (row.roles || []).map((r: any) => r.id),
  });
  dialogVisible.value = true;
};

// 状态修改前钩子 (仅在用户真实点击切换时触发，支持异步防抖与自动阻止状态切换)
const handleBeforeStatusChange = async (row: any): Promise<boolean> => {
  const targetStatus = row.status === 1 ? 0 : 1;
  try {
    await changeUserStatusApi(row.id, targetStatus);
    ElMessage.success(`用户【${row.username}】状态已${targetStatus === 1 ? '启用' : '停用'}`);
    row.status = targetStatus;
    // 状态更新成功后，立即调用搜索/列表接口刷新表格数据
    fetchData();
    return true; // 请求成功，允许开关切换
  } catch (e: any) {
    // 请求失败 (被超级管理员保护拦截或网络异常)，返回 false 自动阻止切换，保持原状
    return false;
  }
};

const handleResetPwd = (row: any) => {
  ElMessageBox.prompt(`请输入用户【${row.username}】的新密码：`, '重置密码', {
    confirmButtonText: '确定重置',
    cancelButtonText: '取消',
    inputPattern: /^.{6,30}$/,
    inputErrorMessage: '密码长度在6-30个字符之间',
  }).then(async ({ value }) => {
    await resetPasswordApi(row.id, { newPassword: value });
    ElMessage.success('密码重置成功');
  });
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除用户【${row.username}】吗？`, '删除警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteUserApi(row.id);
    ElMessage.success('用户删除成功');
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
        await updateUserApi(currentId.value, formData);
        ElMessage.success('用户更新成功');
      } else {
        await createUserApi(formData);
        ElMessage.success('用户创建成功');
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
  fetchOptions();
});
</script>

<style scoped></style>
