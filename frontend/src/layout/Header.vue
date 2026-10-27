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
      <!-- 多语言国际化切换 -->
      <el-dropdown trigger="click" @command="handleLocaleChange" class="action-item">
        <span class="lang-trigger">
          <span class="lang-flag">{{ currentLocaleMeta.flag }}</span>
          <span class="lang-label">{{ currentLocaleMeta.label }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="item in availableLocales"
              :key="item.key"
              :command="item.key"
              :disabled="item.key === locale"
            >
              <span class="dropdown-flag">{{ item.flag }}</span>
              {{ item.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- RGB 自定义调色板主题切换 -->
      <el-popover
        placement="bottom-end"
        :width="260"
        trigger="click"
        popper-class="theme-popover"
      >
        <template #reference>
          <div class="header-icon-btn" :title="t('header.themePicker')">
            <span class="theme-color-preview" :style="{ backgroundColor: themeStore.primaryColor }"></span>
          </div>
        </template>

        <div class="theme-panel">
          <div class="theme-panel-title">{{ t('header.themePicker') }}</div>
          
          <div class="theme-picker-row">
            <span class="picker-label">{{ t('header.selectColor') }}</span>
            <el-color-picker
              v-model="pickerColor"
              size="default"
              :predefine="themeStore.presetColors"
              @change="handleThemeColorChange"
            />
          </div>

          <div class="theme-presets">
            <div class="presets-label">{{ t('header.presetColors') }}</div>
            <div class="presets-grid">
              <span
                v-for="color in themeStore.presetColors"
                :key="color"
                class="preset-item"
                :style="{ backgroundColor: color }"
                :class="{ 'is-active': color.toLowerCase() === themeStore.primaryColor.toLowerCase() }"
                @click="handleSelectPreset(color)"
              ></span>
            </div>
          </div>

          <div class="theme-panel-footer">
            <el-button link type="primary" size="small" @click="handleResetTheme">
              {{ t('header.resetTheme') }}
            </el-button>
          </div>
        </div>
      </el-popover>

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
              <span class="panel-title">{{ t('header.notifications') }}</span>
              <el-tag v-if="unreadCount > 0" size="small" type="danger" round effect="light">
                {{ unreadCount }} {{ t('header.unread') }}
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
                {{ t('header.markAllRead') }}
              </el-button>
              <el-divider direction="vertical" />
              <el-button
                link
                type="danger"
                size="small"
                :disabled="messages.length === 0"
                @click="handleClearAll"
              >
                {{ t('header.clearAll') }}
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
              :description="t('header.noNotice')"
              :image-size="70"
              style="padding: 30px 0"
            />
          </el-scrollbar>

          <!-- 底部待办快捷引导 -->
          <div v-if="pendingLeaveCount > 0" class="notify-footer" @click="handleGoLeave">
            <span>{{ t('header.pendingTodo', { count: pendingLeaveCount }) }}</span>
            <span class="footer-link">{{ t('header.handleNow') }} &gt;</span>
          </div>
        </div>
      </el-popover>

      <!-- 用户信息与退出登录下拉菜单 -->
      <el-dropdown trigger="click" @command="handleCommand">
        <span class="user-profile">
          <el-avatar
            :key="userInfo?.avatar || 'header-avatar'"
            :size="32"
            :src="userInfo?.avatar || '/avatars/avatar-1.svg'"
          />
          <span class="username">{{ userInfo?.realName || userInfo?.username || '用户' }}</span>
          <el-icon><CaretBottom /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">{{ t('common.profile') }}</el-dropdown-item>
            <el-dropdown-item command="payslip">{{ t('header.myPayslip') }}</el-dropdown-item>
            <el-dropdown-item command="logout" divided>{{ t('common.logout') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 员工个人电子工资条安全查看抽屉 -->
    <MyPayslipDrawer v-model="payslipDrawerVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { usePermissionStore } from '@/stores/permission';
import { useNotifyStore, type AppMessage } from '@/stores/notify';
import { useThemeStore } from '@/stores/theme';
import { useI18n, type SupportedLocale } from '@/locales';
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
import MyPayslipDrawer from '@/views/hr/salary/components/MyPayslipDrawer.vue';

const payslipDrawerVisible = ref(false);

const themeStore = useThemeStore();
const { locale, setLocale, t, availableLocales } = useI18n();
const pickerColor = ref(themeStore.primaryColor);

const currentLocaleMeta = computed(() => {
  return availableLocales.find((item) => item.key === locale.value) || availableLocales[0];
});

const handleLocaleChange = (cmd: string | number | object) => {
  setLocale(String(cmd) as SupportedLocale);
  ElMessage.success(t('common.success'));
};

const handleThemeColorChange = (color: string | null) => {
  if (color) {
    themeStore.setPrimaryColor(color);
  }
};

const handleSelectPreset = (color: string) => {
  pickerColor.value = color;
  themeStore.setPrimaryColor(color);
};

const handleResetTheme = () => {
  themeStore.resetTheme();
  pickerColor.value = themeStore.primaryColor;
  ElMessage.success(t('common.success'));
};

/**
 * 顶部导航栏组件输入属性
 * @property isCollapse 侧边栏当前是否处于折叠收起状态
 */
const props = defineProps<{
  isCollapse: boolean;
}>();

/**
 * 顶部导航栏事件派发器
 * @emits toggle 触发侧边栏折叠/展开状态切换
 */
const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

const router = useRouter();
const userStore = useUserStore();
const permissionStore = usePermissionStore();
const notifyStore = useNotifyStore();

/** 消息通知 Popover 浮层可见性状态绑定 */
const popoverVisible = ref(false);

/** 当前登录用户信息 */
const userInfo = computed(() => userStore.userInfo);

/** 未读消息总数计算属性（用于铃铛角标数字） */
const unreadCount = computed(() => notifyStore.unreadCount);

/** 消息中心历史通知列表 */
const messages = computed(() => notifyStore.messages);

/** 待审批请假任务总数 */
const pendingLeaveCount = computed(() => notifyStore.pendingLeaveCount);

/**
 * 点击折叠/展开图标，向父级组件派发切换通知
 */
const handleToggle = () => {
  emit('toggle');
};

/**
 * 点击通知卡片行
 * 标记该条消息为已读、收起浮层并跳转至对应业务页面（如请假审批或系统公告）
 *
 * @param item 被点击的消息对象
 */
const handleClickItem = (item: AppMessage) => {
  notifyStore.markAsRead(item.id);
  popoverVisible.value = false;
  if (item.actionUrl) {
    router.push(item.actionUrl);
  }
};

/**
 * 删除单条消息
 *
 * @param id 待删除消息的唯一标识
 */
const handleRemoveItem = (id: string) => {
  notifyStore.removeMessage(id);
  ElMessage.success('已删除该条消息');
};

/**
 * 一键将所有消息标记为已读
 */
const handleMarkAllRead = () => {
  notifyStore.markAllAsRead();
  ElMessage.success('全部已标记为已读');
};

/**
 * 一键清空通知中心的所有消息（带弹窗防误触确认）
 */
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

/**
 * 点击浮层底部快捷待办栏，跳转至请假审批列表页面
 */
const handleGoLeave = () => {
  popoverVisible.value = false;
  router.push('/hr/leave');
};

/**
 * 下拉菜单操作派发（前往个人中心或安全退出登录）
 *
 * @param command 下拉项指令标识 ('profile' | 'logout')
 */
const handleCommand = (command: string) => {
  if (command === 'profile') {
    router.push('/profile');
  } else if (command === 'payslip') {
    payslipDrawerVisible.value = true;
  } else if (command === 'logout') {
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

/* 多语言选择 */
.lang-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  transition: background-color 0.2s;
}
.lang-trigger:hover {
  background-color: #f2f3f5;
  color: var(--el-color-primary);
}
.lang-flag,
.dropdown-flag {
  font-size: 15px;
}
.dropdown-flag {
  margin-right: 6px;
}

/* 主题颜色快捷入口 */
.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.header-icon-btn:hover {
  background-color: #f2f3f5;
}
.theme-color-preview {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #dcdfe6;
  display: inline-block;
  transition: transform 0.2s;
}
.header-icon-btn:hover .theme-color-preview {
  transform: scale(1.1);
}

/* 主题弹层 */
.theme-panel {
  padding: 4px;
}
.theme-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
.theme-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.picker-label {
  font-size: 13px;
  color: #606266;
}
.theme-presets {
  margin-bottom: 12px;
}
.presets-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.presets-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.preset-item {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s, box-shadow 0.15s;
}
.preset-item:hover {
  transform: scale(1.15);
}
.preset-item.is-active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--el-color-primary);
}
.theme-panel-footer {
  border-top: 1px solid #ebeef5;
  padding-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
