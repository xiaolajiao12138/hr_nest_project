<template>
  <div class="header-container">
    <div class="header-left">
      <el-icon class="collapse-icon" @click="handleToggle">
        <Fold v-if="!isCollapse" />
        <Expand v-else />
      </el-icon>
      <Breadcrumb />
    </div>

    <div class="header-right">
      <el-dropdown trigger="click" @command="handleCommand">
        <span class="user-profile">
          <el-avatar
            :size="32"
            :src="userInfo?.avatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'"
          />
          <span class="username">{{ userInfo?.realName || userInfo?.username || '用户' }}</span>
          <el-icon><CaretBottom /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">个人中心</el-dropdown-item>
            <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';
import { Fold, Expand, CaretBottom } from '@element-plus/icons-vue';
import Breadcrumb from './Breadcrumb.vue';
import { ElMessageBox } from 'element-plus';

const props = defineProps<{
  isCollapse: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

const router = useRouter();
const userStore = useUserStore();
const permissionStore = usePermissionStore();

const userInfo = computed(() => userStore.userInfo);

const handleToggle = () => {
  emit('toggle');
};

const handleCommand = (command: string) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出当前系统吗？', '提示', {
      confirmButtonText: '确定退出',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(() => {
      userStore.logout();
      permissionStore.resetRoutes();
      router.push('/login');
    });
  }
};
</script>

<style scoped>
.header-container {
  height: 56px;
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.collapse-icon {
  font-size: 20px;
  cursor: pointer;
  color: #606266;
}
.header-right {
  display: flex;
  align-items: center;
}
.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.username {
  font-size: 14px;
  color: #333;
}
</style>
