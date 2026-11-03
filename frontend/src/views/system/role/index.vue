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
          v-if="isAdmin()" v-hasPerm="['system:role:add']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增角色
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑角色弹窗 -->
    <BaseDialog :loading="detailLoading"
      v-model="dialogVisible"
      :title="dialogTitle"
      width="500px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <div v-loading="detailLoading">
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
          <el-form-item label="数据范围" prop="dataScope">
            <el-select v-model="formData.dataScope" style="width:100%"><el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
          </el-form-item>
          <el-form-item v-if="formData.dataScope === 'CUSTOM'" label="授权部门">
            <el-tree-select v-model="formData.scopeDeptIds" :data="deptTree" multiple check-strictly node-key="id" :props="{label:'deptName',children:'children'}" style="width:100%" />
          </el-form-item>
          <el-form-item label="备注说明" prop="remark">
            <el-input v-model="formData.remark" type="textarea" :rows="3" />
          </el-form-item>
        </el-form>
      </div>
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
          <el-button type="primary" :loading="savePermLoading" :disabled="drawerLoading || savePermLoading" @click="saveRoleMenus">
            保存权限配置
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { getDeptTreeApi } from '@/api/dept';
import { useUserStore } from '@/stores/user';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance, ElTree } from 'element-plus';
import BaseTable, { TableColumn, ActionColumnConfig } from '@/components/BaseTable.vue';
import BaseSearch from '@/components/BaseSearch.vue';
import BaseDialog from '@/components/BaseDialog.vue';
import { usePagination } from '@/hooks/usePagination';
import {
  getRoleListApi,
  getRoleDetailApi,
  createRoleApi,
  updateRoleApi,
  deleteRoleApi,
  getRoleMenusApi,
  updateRoleMenusApi,
  getMenuTreeApi,
} from '@/api/system';

const userStore = useUserStore();
const isAdmin = () => userStore.roles.includes('admin') || userStore.permissions.includes('*');
const deptTree = ref<any[]>([]);
const scopeOptions = [{value:'SELF',label:'仅本人'},{value:'DEPT',label:'本部门'},{value:'DEPT_AND_CHILDREN',label:'本部门及下级'},{value:'CUSTOM',label:'指定部门'},{value:'ALL',label:'全公司'}];
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
      show: isAdmin() && row.roleKey !== 'admin',
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
      show: isAdmin() && row.roleKey !== 'admin', // 超级管理员角色禁止删除
      onClick: () => handleDelete(row),
    },
  ],
};

const dialogVisible = ref(false);
const dialogTitle = ref('新增角色');
const submitLoading = ref(false);
const detailLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  roleName: '',
  roleKey: '',
  sort: 0,
  remark: '',
  dataScope: 'SELF',
  scopeDeptIds: [] as number[],
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
  getDeptTreeApi().then((res: any) => { deptTree.value = res || []; });
  currentId.value = null;
  dialogTitle.value = '新增角色';
  Object.assign(formData, { roleName: '', roleKey: '', sort: 0, remark: '', dataScope: 'DEPT', scopeDeptIds: [] });
  dialogVisible.value = true;
};

/**
 * 编辑角色
 * 遵循企业级架构规范：点击编辑不从列表行数据拷贝，而是根据角色 ID 异步请求后端独立详情接口获取最新完整数据
 *
 * @param row 列表当前点击行（仅提取 row.id）
 */
const handleEdit = async (row: any) => {
  getDeptTreeApi().then((res: any) => { deptTree.value = res || []; });
  currentId.value = row.id;
  dialogTitle.value = '编辑角色';
  dialogVisible.value = true;
  detailLoading.value = true;

  try {
    const detail: any = await getRoleDetailApi(row.id);
    Object.assign(formData, {
      roleName: detail.roleName,
      roleKey: detail.roleKey,
      sort: detail.sort,
      remark: detail.remark,
      dataScope: detail.dataScope || 'SELF',
      scopeDeptIds: detail.scopeDeptIds || [],
    });
  } catch (err: any) {
    if (!err?.notified) ElMessage.error(err.message || '获取角色详情失败');
    dialogVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
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
  if (submitLoading.value || detailLoading.value || !formRef.value) return;
  submitLoading.value = true;
  try {
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
} finally { submitLoading.value = false; }
};

/**
 * 递归筛选当前菜单树中已被选中的末级叶子节点 Key
 * 彻底解决 Element Plus el-tree 父子联动模式下直接传入父级节点导致下属子节点被反向全选覆盖的经典问题
 *
 * @param tree 全量菜单树形结构
 * @param checkedIds 后端已存储的全部菜单主键 ID (包含父级半选节点)
 * @returns 仅包含末级叶子节点的 ID 数组
 */
const filterLeafKeys = (tree: any[], checkedIds: number[]): number[] => {
  const leafKeys: number[] = [];
  const checkedSet = new Set((checkedIds || []).map(Number));

  const traverse = (nodes: any[]) => {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        if (checkedSet.has(Number(node.id))) {
          leafKeys.push(node.id);
        }
      } else {
        traverse(node.children);
      }
    }
  };

  traverse(tree || []);
  return leafKeys;
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
      menuTreeRef.value.setCheckedKeys([]);
      const leafCheckedKeys = filterLeafKeys(menuTree.value, menuIdsRes || []);
      menuTreeRef.value.setCheckedKeys(leafCheckedKeys);
    }
  } finally {
    drawerLoading.value = false;
  }
};

// 保存角色菜单权限
const saveRoleMenus = async () => {
  if (savePermLoading.value || drawerLoading.value) return;
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
