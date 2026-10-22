<template>
  <div class="menu-page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="handleAddRoot">新增顶级菜单/目录</el-button>
        <el-button :icon="Refresh" @click="fetchMenuTree">刷新路由树</el-button>
      </div>

      <el-alert
        type="success"
        :closable="false"
        title="【动态路由引擎】：此处维护的所有路由、组件路径和按钮权限均保存在数据库 sys_menu 表中。前端工程代码不写死任何路由清单，通过后端接口实时动态解析生成！"
        style="margin-bottom: 16px"
      />

      <el-table
        v-loading="loading"
        :data="menuTree"
        row-key="id"
        border
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <el-table-column prop="title" label="菜单/路由标题" min-width="180" />
        <el-table-column prop="icon" label="图标" width="80" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.icon"><component :is="row.icon" /></el-icon>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="menuType" label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag
              :type="
                row.menuType === 'M'
                  ? 'warning'
                  : row.menuType === 'C'
                  ? 'primary'
                  : 'info'
              "
            >
              {{
                row.menuType === 'M'
                  ? '目录'
                  : row.menuType === 'C'
                  ? '菜单'
                  : '按钮'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由地址 (path)" min-width="160" />
        <el-table-column prop="component" label="组件路径 (component)" min-width="200" />
        <el-table-column prop="perms" label="权限标识 (perms)" min-width="160" />
        <el-table-column prop="sort" label="排序" width="70" align="center" />
        <el-table-column prop="isHidden" label="隐藏" width="70" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isHidden ? 'danger' : 'success'">
              {{ row.isHidden ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.menuType !== 'F'"
              type="primary"
              link
              @click="handleAddChild(row)"
            >
              新增子项
            </el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑菜单路由弹窗 -->
    <BaseDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="680px"
      :confirm-loading="submitLoading"
      @confirm="handleSubmit"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="110px">
        <el-form-item label="上级菜单">
          <el-tree-select
            v-model="formData.parentId"
            :data="treeSelectData"
            :props="{ label: 'title', value: 'id', children: 'children' }"
            check-strictly
            placeholder="请选择上级菜单(不选则为顶级)"
            clearable
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="菜单类型" prop="menuType">
          <el-radio-group v-model="formData.menuType">
            <el-radio label="M">目录 (M)</el-radio>
            <el-radio label="C">菜单/路由 (C)</el-radio>
            <el-radio label="F">按钮权限 (F)</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="菜单标题" prop="title">
              <el-input v-model="formData.title" placeholder="例如 员工档案" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="路由英文名" prop="name">
              <el-input v-model="formData.name" placeholder="例如 EmployeeManage" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row v-if="formData.menuType !== 'F'" :gutter="16">
          <el-col :span="12">
            <el-form-item label="路由路径 path" prop="path">
              <el-input v-model="formData.path" placeholder="例如 /hr/employee" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="组件 component" prop="component">
              <el-input
                v-model="formData.component"
                placeholder="例如 Layout 或 views/hr/employee/index.vue"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="Element图标" prop="icon">
              <el-input v-model="formData.icon" placeholder="例如 UserFilled, Setting" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="权限标识 perms" prop="perms">
              <el-input v-model="formData.perms" placeholder="例如 hr:employee:add" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="显示排序" prop="sort">
              <el-input-number v-model="formData.sort" :min="0" :max="999" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="侧边栏隐藏" prop="isHidden">
              <el-switch v-model="formData.isHidden" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import BaseDialog from '@/components/BaseDialog.vue';
import {
  getMenuTreeApi,
  createMenuApi,
  updateMenuApi,
  deleteMenuApi,
} from '@/api/system';

const loading = ref(false);
const menuTree = ref<any[]>([]);
const dialogVisible = ref(false);
const dialogTitle = ref('新增菜单路由');
const submitLoading = ref(false);
const currentId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const formData = reactive({
  parentId: 0,
  title: '',
  name: '',
  path: '',
  component: '',
  icon: '',
  menuType: 'C',
  perms: '',
  sort: 0,
  isHidden: false,
});

const formRules = {
  title: [{ required: true, message: '菜单标题不能为空', trigger: 'blur' }],
};

const treeSelectData = computed(() => [
  { id: 0, title: '顶级目录', children: menuTree.value },
]);

const fetchMenuTree = async () => {
  loading.value = true;
  try {
    const res: any = await getMenuTreeApi();
    menuTree.value = res || [];
  } finally {
    loading.value = false;
  }
};

const handleAddRoot = () => {
  currentId.value = null;
  dialogTitle.value = '新增顶级菜单/目录';
  Object.assign(formData, {
    parentId: 0,
    title: '',
    name: '',
    path: '',
    component: 'Layout',
    icon: '',
    menuType: 'M',
    perms: '',
    sort: 0,
    isHidden: false,
  });
  dialogVisible.value = true;
};

const handleAddChild = (row: any) => {
  currentId.value = null;
  dialogTitle.value = `为【${row.title}】添加子菜单/按钮`;
  Object.assign(formData, {
    parentId: row.id,
    title: '',
    name: '',
    path: '',
    component: '',
    icon: '',
    menuType: row.menuType === 'M' ? 'C' : 'F',
    perms: '',
    sort: 0,
    isHidden: false,
  });
  dialogVisible.value = true;
};

const handleEdit = (row: any) => {
  currentId.value = row.id;
  dialogTitle.value = `编辑菜单路由【${row.title}】`;
  Object.assign(formData, {
    parentId: row.parentId,
    title: row.title,
    name: row.name,
    path: row.path,
    component: row.component,
    icon: row.icon,
    menuType: row.menuType,
    perms: row.perms,
    sort: row.sort,
    isHidden: Boolean(row.isHidden),
  });
  dialogVisible.value = true;
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定删除菜单【${row.title}】吗？删除后相关角色的该路由将同步失效。`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    await deleteMenuApi(row.id);
    ElMessage.success('菜单路由删除成功');
    fetchMenuTree();
  });
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitLoading.value = true;
    try {
      if (currentId.value) {
        await updateMenuApi(currentId.value, formData);
        ElMessage.success('菜单路由更新成功');
      } else {
        await createMenuApi(formData);
        ElMessage.success('菜单路由新增成功');
      }
      dialogVisible.value = false;
      fetchMenuTree();
    } finally {
      submitLoading.value = false;
    }
  });
};

onMounted(() => {
  fetchMenuTree();
});
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  gap: 10px;
}
</style>
