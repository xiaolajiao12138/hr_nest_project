<template>
  <div class="role-page">
    <BaseSearch :model="searchForm" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键字" prop="keyword">
        <el-input
          v-model="searchForm.keyword"
          placeholder="角色名称/字符"
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
          v-hasPerm="['system:role:add']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增角色
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑角色弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
        <el-form-item label="角色名称" prop="roleName">
          <el-input v-model="formData.roleName" placeholder="例如 人事专员" />
        </el-form-item>
        <el-form-item label="权限字符" prop="roleKey">
          <el-input
            v-model="formData.roleKey"
            placeholder="例如 hr_specialist"
            :disabled="!!currentId"
          />
        </el-form-item>
        <el-form-item label="显示排序" prop="sort">
          <el-input-number v-model="formData.sort" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="备注说明" prop="remark">
          <el-input v-model="formData.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
    </BaseDialog>

    <!-- 分配菜单与按钮权限抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="`为【${currentRole?.roleName}】分配菜单路由与按钮权限`"
      size="450px"
      destroy-on-close
    >
      <div v-loading="drawerLoading" class="drawer-content">
        <el-alert
          type="info"
          :closable="false"
          title="勾选菜单和按钮权限后点击保存，该角色用户登录后将动态挂载对应的路由页面与显示授权按钮。"
          style="margin-bottom: 16px"
        />

        <el-tree
          ref="menuTreeRef"
          :data="menuTree"
          show-checkbox
          node-key="id"
          default-expand-all
          :props="{ label: 'title', children: 'children' }"
        />
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="savePermLoading" @click="saveRoleMenus">
            保存权限配置
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance, ElTree } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import { usePagination } from '@/hooks/usePagination';
import {
  getRoleListApi,
  createRoleApi,
  updateRoleApi,
  deleteRoleApi,
  getRoleMenusApi,
  updateRoleMenusApi,
  getMenuTreeApi,
} from '@/api/system';

const loading = ref(false);
const tableData = ref<any[]>([]);

const searchForm = reactive({ keyword: '' });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: 'roleName', label: '角色名称', width: 160 },
  { prop: 'roleKey', label: '权限标识字符', width: 160 },
  { prop: 'sort', label: '显示排序', width: 90 },
  { prop: 'remark', label: '备注说明', minWidth: 200 },
  { prop: 'createdAt', label: '创建时间', width: 180, formatter: (val) => val ? new Date(val).toLocaleString() : '-' },
];

// 企业级操作列配置 (通过 actionColumn 集中驱动)
const actionColumn: ActionColumnConfig = {
  label: '操作',
  width: 220,
  fixed: 'right',
  buttons: (row) => [
    {
      label: '编辑',
      type: 'primary',
      perm: ['system:role:edit'],
      onClick: () => handleEdit(row),
    },
    {
      label: '分配权限',
      type: 'success',
      perm: ['system:role:edit'],
      onClick: () => openPermissionDrawer(row),
    },
    {
      label: '删除',
      type: 'danger',
      perm: ['system:role:delete'],
      show: row.roleKey !== 'admin', // 超级管理员角色禁止删除
      onClick: () => handleDelete(row),
    },
  ],
};

const dialogVisible = ref(false);
const dialogTitle = ref('新增角色');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  roleName: '',
  roleKey: '',
  sort: 0,
  remark: '',
});

const formRules = {
  roleName: [{ required: true, message: '角色名称不能为空', trigger: 'blur' }],
  roleKey: [{ required: true, message: '权限字符不能为空', trigger: 'blur' }],
};

// 抽屉权限
const drawerVisible = ref(false);
const drawerLoading = ref(false);
const savePermLoading = ref(false);
const currentRole = ref<any>(null);
const menuTree = ref<any[]>([]);
const menuTreeRef = ref<InstanceType<typeof ElTree>>();

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getRoleListApi({
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
  dialogTitle.value = '新增角色';
  Object.assign(formData, { roleName: '', roleKey: '', sort: 0, remark: '' });
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑角色';
  Object.assign(formData, {
    roleName: row.roleName,
    roleKey: row.roleKey,
    sort: row.sort,
    remark: row.remark,
  });
  dialogVisible.value = true;
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除角色【${row.roleName}】吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteRoleApi(row.id);
    ElMessage.success('角色删除成功');
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
        await updateRoleApi(currentId.value, formData);
        ElMessage.success('角色更新成功');
      } else {
        await createRoleApi(formData);
        ElMessage.success('角色创建成功');
      }
      dialogVisible.value = false;
      fetchData();
    } finally {
      submitLoading.value = false;
    }
  });
};

// 打开分配权限抽屉
const openPermissionDrawer = async (row: any) => {
  currentRole.value = row;
  drawerVisible.value = true;
  drawerLoading.value = true;
  try {
    const [treeRes, menuIdsRes]: any = await Promise.all([
      getMenuTreeApi(),
      getRoleMenusApi(row.id),
    ]);
    menuTree.value = treeRes || [];

    await nextTick();
    if (menuTreeRef.value) {
      // 设置已选中的节点
      menuTreeRef.value.setCheckedKeys(menuIdsRes || []);
    }
  } finally {
    drawerLoading.value = false;
  }
};

// 保存角色菜单权限
const saveRoleMenus = async () => {
  if (!currentRole.value || !menuTreeRef.value) return;
  savePermLoading.value = true;
  try {
    const checkedKeys = menuTreeRef.value.getCheckedKeys();
    const halfCheckedKeys = menuTreeRef.value.getHalfCheckedKeys();
    const totalKeys = [...checkedKeys, ...halfCheckedKeys] as number[];

    await updateRoleMenusApi({ roleId: currentRole.value.id, menuIds: totalKeys });
    ElMessage.success('角色菜单路由及按钮权限已成功保存');
    drawerVisible.value = false;
  } finally {
    savePermLoading.value = false;
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped></style>
