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
          v-if="isAdmin" v-hasPerm="['system:user:add']"
          type="primary"
          :icon="Plus"
          @click="handleAdd"
        >
          新增用户
        </el-button>
      </template>
    </BaseTable>

    <!-- 新增 / 编辑用户弹窗 -->
    <BaseDialog :loading="detailLoading"
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <div v-loading="detailLoading">
        <el-form
          ref="formRef"
          :model="formData"
          :rules="formRules"
          label-width="90px"
        >
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
          <el-form-item v-if="isAdmin" label="分配角色" prop="roleIds">
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
          <el-form-item v-if="isAdmin" label="员工档案">
            <el-select v-model="formData.employeeId" filterable remote clearable :remote-method="searchEmployees" placeholder="输入工号或姓名搜索关联档案" style="width:100%">
              <el-option v-for="emp in employeeOptions" :key="emp.id" :label="emp.empNo+' · '+emp.name" :value="emp.id" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h, computed } from "vue";
import { getEmployeeOptionsApi } from '@/api/employee';
import { useUserStore } from '@/stores/user';
import { Plus } from "@element-plus/icons-vue";
import {
  ElMessage,
  ElMessageBox,
  FormInstance,
  ElTag,
  ElSwitch,
} from "element-plus";
import BaseTable, {
  TableColumn,
  ActionColumnConfig,
} from "@/components/BaseTable.vue";
import BaseSearch from "@/components/BaseSearch.vue";
import BaseDialog from "@/components/BaseDialog.vue";
import { usePagination } from "@/hooks/usePagination";
import {
  getUserListApi,
  getUserDetailApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  resetPasswordApi,
  changeUserStatusApi,
  getAllRolesApi,
} from "@/api/system";
import { getDeptTreeApi } from "@/api/dept";

const userStore = useUserStore();
const isAdmin = computed(() => userStore.roles.includes('admin') || userStore.permissions.includes('*'));
const employeeOptions = ref<any[]>([]);
let employeeRequestId = 0;
const searchEmployees = async (keyword = '') => {
  if (!isAdmin.value) return;
  const requestId = ++employeeRequestId;
  const res: any = await getEmployeeOptionsApi({purpose:'user',keyword,page:1,pageSize:50});
  if (requestId === employeeRequestId) employeeOptions.value = res.list || [];
};
const loading = ref(false);
const tableData = ref<any[]>([]);
const allRoles = ref<any[]>([]);
const deptTree = ref<any[]>([]);

const searchForm = reactive({ keyword: "" });

const { pagination, handlePageChange, handleSizeChange, resetPage } =
  usePagination(() => fetchData());

const columns: TableColumn[] = [
  { prop: "username", label: "账号", width: 130 },
  { prop: "realName", label: "姓名", width: 130 },
  { prop: "phone", label: "手机号", width: 140 },
  {
    prop: "dept",
    label: "所属部门",
    width: 140,
    formatter: (val) => val?.deptName || "-",
  },
  {
    prop: "roles",
    label: "分配角色",
    minWidth: 160,
    render: ({ row }) => {
      if (!row.roles || row.roles.length === 0) return "-";
      return h(
        "div",
        {
          style:
            "display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;",
        },
        row.roles.map((r: any) =>
          h(
            ElTag,
            { key: r.id, size: "small", type: "success" },
            () => r.roleName,
          ),
        ),
      );
    },
  },
  {
    prop: "status",
    label: "启用状态",
    width: 110,
    render: ({ row }) =>
      h(ElSwitch, {
        modelValue: row.status,
        "onUpdate:modelValue": (val: any) => {
          row.status = val;
        },
        activeValue: 1,
        inactiveValue: 0,
        disabled: row.username === "admin",
        beforeChange: () => handleBeforeStatusChange(row),
      }),
  },
  {
    prop: "createdAt",
    label: "创建时间",
    width: 170,
    formatter: (val) => (val ? new Date(val).toLocaleString() : "-"),
  },
];

// 企业级操作列配置 (通过 actionColumn 集中驱动，支持权限自动校验与防误删)
const actionColumn: ActionColumnConfig = {
  label: "操作",
  width: 200,
  fixed: "right",
  buttons: (row) => [
    {
      label: "编辑",
      type: "primary",
      perm: ["system:user:edit"],
      onClick: () => handleEdit(row),
    },
    {
      label: "重置密码",
      type: "warning",
      perm: ["system:user:resetPwd"],
      onClick: () => handleResetPwd(row),
    },
    {
      label: "删除",
      type: "danger",
      perm: ["system:user:delete"],
      show: row.username !== "admin", // 超级管理员直接隐藏删除按钮，增加安全防线
      onClick: () => handleDelete(row),
    },
  ],
};

const dialogVisible = ref(false);
const dialogTitle = ref("新增用户");
const submitLoading = ref(false);
const detailLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  username: "",
  password: "",
  realName: "",
  phone: "",
  deptId: undefined as number | undefined,
  roleIds: [] as number[],
  employeeId: null as number | null,
});

const formRules = {
  username: [{ required: true, message: "账号不能为空", trigger: "blur" }],
  password: [{ required: true, message: "密码不能为空", trigger: "blur" }],
  realName: [{ required: true, message: "真实姓名不能为空", trigger: "blur" }],
};

let listRequestId=0;
const fetchData = async () => {
  const requestId=++listRequestId;
  loading.value = true;
  try {
    const res: any = await getUserListApi({
      keyword: searchForm.keyword,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if(requestId!==listRequestId)return;
    if(!res.list?.length && res.total>0 && pagination.page>1){pagination.page=Math.max(1,Math.ceil(res.total/pagination.pageSize));return fetchData();}
    tableData.value = res.list || [];
    pagination.total = res.total || 0;
  } finally {
    if(requestId===listRequestId)loading.value = false;
  }
};

const fetchOptions = async () => {
  const [roleRes, deptRes]: any = await Promise.all([
    isAdmin.value ? getAllRolesApi() : Promise.resolve([]),
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
  searchForm.keyword = "";
  resetPage();
  fetchData();
};

const handleAdd = () => {
  fetchOptions();
  searchEmployees();
  currentId.value = null;
  dialogTitle.value = "新增用户";
  Object.assign(formData, {
    username: "",
    password: "",
    realName: "",
    phone: "",
    deptId: undefined,
    roleIds: [],
    employeeId: null,
  });
  dialogVisible.value = true;
};

/**
 * 编辑用户
 * 遵循企业级架构规范：点击编辑不从列表行数据拷贝，而是根据用户 ID 异步请求后端独立详情接口获取最新完整用户与角色关联数据
 *
 * @param row 列表当前点击行（仅提取 row.id）
 */
let detailRequestId=0;
const handleEdit = async (row: any) => {
  fetchOptions();
  searchEmployees();
  const requestId=++detailRequestId;
  currentId.value = row.id;
  dialogTitle.value = "编辑用户";
  dialogVisible.value = true;
  detailLoading.value = true;

  try {
    const detail: any = await getUserDetailApi(row.id);
    if(requestId!==detailRequestId || !dialogVisible.value || currentId.value!==row.id)return;
    Object.assign(formData, {
      username: detail.username,
      employeeId: detail.employeeId || null,
      realName: detail.realName,
      phone: detail.phone,
      deptId: detail.deptId,
      roleIds: (detail.roles || []).map((r: any) => r.id),
    });
  } catch (err: any) {
    if (!err?.notified) ElMessage.error(err.message || '获取用户详情失败');
    dialogVisible.value = false;
  } finally {
    if(requestId===detailRequestId)detailLoading.value = false;
  }
};

// 状态修改前钩子 (仅在用户真实点击切换时触发，支持异步防抖与自动阻止状态切换)
const handleBeforeStatusChange = async (row: any): Promise<boolean> => {
  if(row._statusLoading)return false;
  row._statusLoading=true;
  const targetStatus = row.status === 1 ? 0 : 1;
  try {
    await changeUserStatusApi({ id: row.id, status: targetStatus });
    ElMessage.success(
      `用户【${row.username}】状态已${targetStatus === 1 ? "启用" : "停用"}`,
    );
    row.status = targetStatus;
    // 状态更新成功后，立即调用搜索/列表接口刷新表格数据
    fetchData();
    return false; // 请求成功，允许开关切换
  } catch (e: any) {
    // 请求失败 (被超级管理员保护拦截或网络异常)，返回 false 自动阻止切换，保持原状
    return false;
  }finally{row._statusLoading=false;}
};

const handleResetPwd = (row: any) => {
  ElMessageBox.prompt(`请输入用户【${row.username}】的新密码：`, "重置密码", {
    confirmButtonText: "确定重置",
    cancelButtonText: "取消",
    inputPattern: /^.{6,30}$/,
    inputErrorMessage: "密码长度在6-30个字符之间",
  }).then(async ({ value }) => {
    await resetPasswordApi({ id: row.id, newPassword: value });
    ElMessage.success("密码重置成功");
  }).catch(()=>{});
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除用户【${row.username}】吗？`, "删除警告", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  }).then(async () => {
    await deleteUserApi(row.id);
    ElMessage.success("用户删除成功");
    fetchData();
  }).catch(()=>{});
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
        const { username, password, roleIds, employeeId, ...profile } = formData;
        await updateUserApi(currentId.value, {...profile, ...(isAdmin.value ? {roleIds, employeeId} : {})});
        ElMessage.success("用户更新成功");
      } else {
        await createUserApi(formData);
        ElMessage.success("用户创建成功");
      }
      dialogVisible.value = false;
      fetchData();
    } finally {
      submitLoading.value = false;
    }
  });
} finally { submitLoading.value = false; }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped></style>
