<template>
  <div class="dept-page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAddRoot">新增根部门</el-button>
        <el-button :icon="Refresh" @click="fetchTree">刷新</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="deptTree"
        row-key="id"
        border
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <el-table-column prop="deptName" label="部门名称" min-width="200" />
        <el-table-column prop="leader" label="负责人" width="120" align="center" />
        <el-table-column prop="phone" label="联系电话" width="140" align="center" />
        <el-table-column prop="sort" label="排序" width="80" align="center" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'">
              {{ row.status === 1 ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleAddChild(row)">新增子部门</el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">事务删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <div v-loading="detailLoading">
        <el-form ref="formRef" :model="formData" :rules="formRules" label-width="90px">
          <el-form-item label="上级部门">
            <el-tree-select
              v-model="formData.parentId"
              :data="treeSelectData"
              :props="{ label: 'deptName', value: 'id', children: 'children' }"
              check-strictly
              placeholder="请选择上级部门(不选则为根部门)"
              clearable
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="部门名称" prop="deptName">
            <el-input v-model="formData.deptName" placeholder="请输入部门名称" />
          </el-form-item>
          <el-form-item label="负责人" prop="leader">
            <el-input v-model="formData.leader" placeholder="请输入负责人姓名" />
          </el-form-item>
          <el-form-item label="联系电话" prop="phone">
            <el-input v-model="formData.phone" placeholder="请输入联系电话" />
          </el-form-item>
          <el-form-item label="显示排序" prop="sort">
            <el-input-number v-model="formData.sort" :min="0" :max="999" />
          </el-form-item>
          <el-form-item label="部门状态">
            <el-radio-group v-model="formData.status">
              <el-radio :label="1">启用</el-radio>
              <el-radio :label="0">停用</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import BaseDialog from '@/components/BaseDialog.vue';
import {
  getDeptTreeApi,
  getDeptDetailApi,
  createDeptApi,
  updateDeptApi,
  deleteDeptApi,
} from '@/api/dept';

const loading = ref(false);
const deptTree = ref<any[]>([]);
const dialogVisible = ref(false);
const dialogTitle = ref('新增部门');
const submitLoading = ref(false);
const detailLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  parentId: 0,
  deptName: '',
  leader: '',
  phone: '',
  email: '',
  sort: 0,
  status: 1,
});

const formRules = {
  deptName: [{ required: true, message: '部门名称不能为空', trigger: 'blur' }],
};

const treeSelectData = computed(() => [
  { id: 0, deptName: '无 (作为顶级根部门)', children: deptTree.value },
]);

const fetchTree = async () => {
  loading.value = true;
  try {
    const res: any = await getDeptTreeApi();
    deptTree.value = res || [];
  } finally {
    loading.value = false;
  }
};

const handleAddRoot = () => {
  currentId.value = null;
  dialogTitle.value = '新增根部门';
  formData.parentId = 0;
  formData.deptName = '';
  formData.leader = '';
  formData.phone = '';
  formData.sort = 0;
  formData.status = 1;
  dialogVisible.value = true;
};

const handleAddChild = (row: any) => {
  currentId.value = null;
  dialogTitle.value = `为【${row.deptName}】新增子部门`;
  formData.parentId = row.id;
  formData.deptName = '';
  formData.leader = '';
  formData.phone = '';
  formData.sort = 0;
  formData.status = 1;
  dialogVisible.value = true;
};

/**
 * 编辑部门
 * 遵循企业级架构规范：点击编辑不从树节点行数据拷贝，而是根据部门 ID 异步请求后端独立详情接口获取最新完整部门信息
 * 
 * @param row 列表当前点击行（仅提取 row.id）
 */
const handleEdit = async (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = '编辑部门';
  dialogVisible.value = true;
  detailLoading.value = true;

  try {
    const detail: any = await getDeptDetailApi(row.id);
    formData.parentId = detail.parentId;
    formData.deptName = detail.deptName;
    formData.leader = detail.leader;
    formData.phone = detail.phone;
    formData.sort = detail.sort;
    formData.status = detail.status;
  } catch (err: any) {
    ElMessage.error(err.message || '获取部门详情失败');
    dialogVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(
    `确定删除部门【${row.deptName}】吗？若部门或子部门下仍存在员工则会被事务拦截，无员工时将事务级联删除所有子部门。`,
    '事务删除警告',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
    },
  ).then(async () => {
    try {
      await deleteDeptApi(row.id);
      ElMessage.success('部门及子部门事务删除成功');
      fetchTree();
    } catch (e: any) {
      // 错误信息在拦截器已展示
    }
  });
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitLoading.value = true;
    try {
      if (currentId.value) {
        await updateDeptApi(currentId.value, formData);
        ElMessage.success('部门更新成功');
      } else {
        await createDeptApi(formData);
        ElMessage.success('部门创建成功');
      }
      dialogVisible.value = false;
      fetchTree();
    } finally {
      submitLoading.value = false;
    }
  });
};

onMounted(() => {
  fetchTree();
});
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 10px;
}
</style>
