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
      <!-- 实时通讯与推送: 消息通知中心 Popover 浮层 -->
      <el-popover
        v-model:visible="popoverVisible"
        placement="bottom-end"
        :width="380"
        trigger="click"
        popper-class="notify-popover"
      >
        <template #reference>
          <div class="notice-bell-btn">
            <el-badge
              :value="unreadCount"
              :max="99"
              :hidden="unreadCount === 0"
              class="badge-item"
            >
              <el-icon class="bell-icon"><Bell /></el-icon>
            </el-badge>
          </div>
        </template>

        <!-- 消息面板内容 -->
        <div class="notify-panel">
          <!-- 头部标题与批量操作 -->
          <div class="notify-header">
            <div class="header-title-box">
              <span class="panel-title">消息通知</span>
              <el-tag v-if="unreadCount > 0" size="small" type="danger" round effect="light">
                {{ unreadCount }} 未读
              </el-tag>
            </div>
            <div class="header-actions">
              <el-button
                link
                type="primary"
                size="small"
                :disabled="unreadCount === 0"
                @click="handleMarkAllRead"
              >
                全部已读
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                link
                type="danger"
                size="small"
                :disabled="messages.length === 0"
                @click="handleClearAll"
              >
                清空
              </el-button>
            </div>
          </div>

          <!-- 消息列表主体 -->
          <el-scrollbar max-height="360px">
            <div v-if="messages.length > 0" class="notify-list">
              <div
                v-for="item in messages"
                :key="item.id"
                class="notify-item"
                :class="{ 'is-unread': !item.isRead }"
                @click="handleClickItem(item)"
              >
                <!-- 图标 -->
                <div class="item-icon-box" :class="item.type === 'LEAVE' ? 'icon-leave' : 'icon-notice'">
                  <el-icon v-if="item.type === 'LEAVE'"><Tickets /></el-icon>
                  <el-icon v-else><Notification /></el-icon>
                </div>

                <!-- 消息内容 -->
                <div class="item-main">
                  <div class="item-top">
                    <span class="item-title" :title="item.title">{{ item.title }}</span>
                    <span v-if="!item.isRead" class="unread-dot"></span>
                  </div>
                  <div class="item-content" :title="item.content">{{ item.content }}</div>
                  <div class="item-time">{{ item.createdAt }}</div>
                </div>

                <!-- 单条删除按钮 -->
                <div class="item-delete-btn" @click.stop="handleRemoveItem(item.id)">
                  <el-icon><Delete /></el-icon>
                </div>
              </div>
            </div>

            <el-empty
              v-else
              description="暂无任何通知消息"
              :image-size="70"
              style="padding: 30px 0"
            />
          </el-scrollbar>

          <!-- 底部待办快捷引导 -->
          <div v-if="pendingLeaveCount > 0" class="notify-footer" @click="handleGoLeave">
            <span>当前还有 <b>{{ pendingLeaveCount }}</b> 笔待审批请假任务</span>
            <span class="footer-link">立即办理 &gt;</span>
          </div>
        </div>
      </el-popover>

      <!-- 用户信息与退出登录下拉菜单 -->
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
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';
import { useNotifyStore, type AppMessage } from '@/stores/notify';
import {
  Fold,
  Expand,
  CaretBottom,
  Bell,
  Tickets,
  Notification,
  Delete,
} from '@element-plus/icons-vue';
import Breadcrumb from './Breadcrumb.vue';
import { ElMessageBox, ElMessage } from 'element-plus';

const props = defineProps<{
  isCollapse: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

const router = useRouter();
const userStore = useUserStore();
const permissionStore = usePermissionStore();
const notifyStore = useNotifyStore();

const popoverVisible = ref(false);

const userInfo = computed(() => userStore.userInfo);
const unreadCount = computed(() => notifyStore.unreadCount);
const messages = computed(() => notifyStore.messages);
const pendingLeaveCount = computed(() => notifyStore.pendingLeaveCount);

const handleToggle = () => {
  emit('toggle');
};

// 点击消息行：标记已读并跳转对应页面
const handleClickItem = (item: AppMessage) => {
  notifyStore.markAsRead(item.id);
  popoverVisible.value = false;
  if (item.actionUrl) {
    router.push(item.actionUrl);
  }
};

// 单条删除
const handleRemoveItem = (id: string) => {
  notifyStore.removeMessage(id);
  ElMessage.success('已删除该条消息');
};

// 全部已读
const handleMarkAllRead = () => {
  notifyStore.markAllAsRead();
  ElMessage.success('全部已标记为已读');
};

// 一键清空全部消息
const handleClearAll = () => {
  ElMessageBox.confirm('确定要清空全部消息通知吗？', '提示', {
    confirmButtonText: '确定清空',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    notifyStore.clearAll();
    ElMessage.success('消息已全部清空');
  });
};

// 点击底部快速前往审批
const handleGoLeave = () => {
  popoverVisible.value = false;
  router.push('/hr/leave');
};

const handleCommand = (command: string) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出当前系统吗？', '提示', {
      confirmButtonText: '确定退出',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(() => {
      notifyStore.closeSSE();
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
  gap: 20px;
}

/* 铃铛按钮 */
.notice-bell-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: background-color 0.2s;
}
.notice-bell-btn:hover {
  background-color: #f2f3f5;
}
.bell-icon {
  font-size: 20px;
  color: #606266;
}

/* 用户信息 */
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

/* 消息中心浮层面板 */
.notify-panel {
  display: flex;
  flex-direction: column;
}
.notify-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 12px 12px;
  border-bottom: 1px solid #f0f2f5;
}
.header-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.header-actions {
  display: flex;
  align-items: center;
}

/* 消息列表项 */
.notify-list {
  display: flex;
  flex-direction: column;
}
.notify-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #f2f4f7;
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s;
}
.notify-item:hover {
  background-color: #f9fafc;
}
.notify-item.is-unread {
  background-color: #fbfdff;
}

/* 消息类型图标 */
.item-icon-box {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}
.icon-leave {
  background-color: #ecf5ff;
  color: #409eff;
}
.icon-notice {
  background-color: #fdf6ec;
  color: #e6a23c;
}

/* 消息主体 */
.item-main {
  flex: 1;
  min-width: 0;
}
.item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.item-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #f56c6c;
}
.item-content {
  font-size: 12px;
  color: #606266;
  margin: 4px 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.item-time {
  font-size: 11px;
  color: #a8abb2;
}

/* 删除按钮 */
.item-delete-btn {
  opacity: 0;
  font-size: 14px;
  color: #909399;
  cursor: pointer;
  padding: 4px;
  transition: all 0.2s;
}
.notify-item:hover .item-delete-btn {
  opacity: 1;
}
.item-delete-btn:hover {
  color: #f56c6c;
}

/* 底部待办横条 */
.notify-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: #fafbfc;
  border-top: 1px solid #f0f2f5;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  transition: background-color 0.2s;
}
.notify-footer:hover {
  background-color: #f2f6fc;
}
.footer-link {
  color: #409eff;
  font-weight: 500;
}
</style>
