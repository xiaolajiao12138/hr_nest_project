import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';
import router from '@/router';
import { getToken } from '@/utils/auth';
import { getLeavePendingCountApi } from '@/api/leave';
import { getLatestNoticesApi } from '@/api/ops';

export interface AppMessage {
  id: string;
  title: string;
  content: string;
  type: 'LEAVE' | 'NOTICE';
  actionUrl: string;
  isRead: boolean;
  createdAt: string;
}

export interface SseMessageData {
  type: 'NOTICE_BROADCAST' | 'LEAVE_AUDIT_NOTIFY' | 'TODO_BADGE_UPDATE' | 'HEARTBEAT';
  title?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

const STORAGE_KEY = 'hr_user_notifications';

// 格式化当前时间为 YYYY-MM-DD HH:mm:ss
function formatCurrentTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export const useNotifyStore = defineStore('notify', {
  state: () => ({
    // 待审批请假待办数量 (服务端真实统计)
    pendingLeaveCount: 0,
    // 消息通知列表 (已读/未读持久化)
    messages: [] as AppMessage[],
    // EventSource 实例引用
    eventSource: null as EventSource | null,
    // 当前 SSE 连接就绪状态
    isConnected: false,
    // 重连定时器
    reconnectTimer: null as any,
  }),

  getters: {
    // 顶部未读消息数
    unreadCount: (state) => {
      return state.messages.filter((m) => !m.isRead).length;
    },
  },

  actions: {
    /**
     * 从 LocalStorage 加载历史消息
     */
    loadFromStorage() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.messages = JSON.parse(stored);
        }
      } catch (e) {
        this.messages = [];
      }
    },

    /**
     * 保存消息至 LocalStorage
     */
    saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
      } catch (e) {
        console.warn('[Notify] 本地消息存储失败', e);
      }
    },

    /**
     * 添加一条新消息至列表首部
     */
    addMessage(msg: Omit<AppMessage, 'id' | 'isRead' | 'createdAt'>) {
      const newMessage: AppMessage = {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        isRead: false,
        createdAt: formatCurrentTime(),
      };
      // 保持最多 50 条历史消息
      this.messages.unshift(newMessage);
      if (this.messages.length > 50) {
        this.messages = this.messages.slice(0, 50);
      }
      this.saveToStorage();
    },

    /**
     * 标记单条消息为已读
     */
    markAsRead(id: string) {
      const target = this.messages.find((m) => m.id === id);
      if (target && !target.isRead) {
        target.isRead = true;
        this.saveToStorage();
      }
    },

    /**
     * 一键全部标记为已读
     */
    markAllAsRead() {
      this.messages.forEach((m) => {
        m.isRead = true;
      });
      this.saveToStorage();
    },

    /**
     * 删除单条消息
     */
    removeMessage(id: string) {
      this.messages = this.messages.filter((m) => m.id !== id);
      this.saveToStorage();
    },

    /**
     * 一键清空所有消息
     */
    clearAll() {
      this.messages = [];
      this.saveToStorage();
    },

    /**
     * 初始化 SSE 实时事件流连接
     */
    initSSE() {
      this.loadFromStorage();
      const token = getToken();
      if (!token) return;

      this.closeSSE();

      try {
        const prefix = import.meta.env.VITE_API_PREFIX || '/api';
        const sseUrl = `${prefix}/sse/stream?token=${encodeURIComponent(token)}`;

        const es = new EventSource(sseUrl);
        this.eventSource = es;

        es.onopen = () => {
          this.isConnected = true;
          console.log('[SSE] 实时通讯推送通道就绪');
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
        };

        es.onmessage = (event) => {
          if (!event.data) return;
          try {
            const raw = JSON.parse(event.data);
            this.handleSseMessage(raw);
          } catch (err) {
            console.warn('[SSE] 解析推送消息格式异常:', err);
          }
        };

        es.onerror = () => {
          this.closeSSE();
          if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              this.initSSE();
            }, 8000);
          }
        };

        // 初始拉取一次真实待审批数量与最新公告
        this.fetchPendingCount();
        this.fetchRecentNotices();
      } catch (e) {
        console.error('[SSE] 启动异常:', e);
      }
    },

    /**
     * 分发处理各类实时业务推送事件
     */
    handleSseMessage(rawPayload: any) {
      if (!rawPayload) return;

      // 核心解包：兼容后端拦截器嵌套返回的 data.data 结构
      let payload: any = rawPayload;
      while (payload && payload.data && typeof payload.data === 'object' && payload.data.type) {
        payload = payload.data;
      }

      if (payload.type === 'HEARTBEAT') {
        return;
      }

      // 场景 1: 发布全员新公告时，右下角弹窗实时触达，并存入消息中心
      if (payload.type === 'NOTICE_BROADCAST') {
        const title = payload.title || '📢 全员新公告发布';
        const content = payload.data?.content || payload.message || '您有一条新的企业公告，请注意查阅！';

        // 存入消息通知中心
        this.addMessage({
          title,
          content,
          type: 'NOTICE',
          actionUrl: '/ops/notice',
        });

        // 弹出页面右上角全局通知弹窗，支持点击跳转
        ElNotification({
          title,
          message: content,
          type: 'info',
          position: 'top-right',
          duration: 7000,
          onClick: () => {
            router.push('/ops/notice');
          },
        });
        return;
      }

      // 场景 2: 主管审批了请假申请 / 新提交请假，前端顶部弹窗提醒，并存入消息中心
      if (payload.type === 'LEAVE_AUDIT_NOTIFY') {
        const title = payload.title || '请假审批提醒';
        const content = payload.message || '请假流程审批状态已更新';
        const isReject = payload.data?.action === 'REJECTED';

        // 存入消息通知中心
        this.addMessage({
          title,
          content,
          type: 'LEAVE',
          actionUrl: '/hr/leave',
        });

        // 刷新最新的待办审批数量
        this.fetchPendingCount();

        // 顶部弹窗提醒，支持点击跳转
        ElNotification({
          title,
          message: content,
          type: isReject ? 'warning' : 'success',
          position: 'top-right',
          duration: 5000,
          onClick: () => {
            router.push('/hr/leave');
          },
        });
        return;
      }

      // 场景 3: 审批代办任务徽标数字变动
      if (payload.type === 'TODO_BADGE_UPDATE') {
        if (payload.data && typeof payload.data.pendingCount === 'number') {
          this.pendingLeaveCount = payload.data.pendingCount;
        } else {
          this.fetchPendingCount();
        }
      }
    },

    /**
     * 准确拉取最新的待审批请假真实数量
     */
    async fetchPendingCount() {
      try {
        const res = await getLeavePendingCountApi();
        if (res && typeof res.count === 'number') {
          this.pendingLeaveCount = res.count;
        }
      } catch (err) {
        // 静默
      }
    },

    /**
     * 初始同步最近发布的系统公告 (确保即使发布时未在线，登录后也能在消息中心查看到最新公告)
     */
    async fetchRecentNotices() {
      try {
        const list: any = await getLatestNoticesApi();
        if (Array.isArray(list) && list.length > 0) {
          let hasNew = false;
          list.forEach((item) => {
            const exists = this.messages.some(
              (m) => m.type === 'NOTICE' && m.title.includes(item.title),
            );
            if (!exists) {
              const noticeTitle =
                item.noticeType === 'ANNOUNCEMENT'
                  ? `📢 ${item.title}`
                  : `📌 ${item.title}`;
              this.messages.push({
                id: `notice_${item.id}`,
                title: noticeTitle,
                content: item.content || '企业发布了最新公告，请及时查阅。',
                type: 'NOTICE',
                actionUrl: '/ops/notice',
                isRead: false,
                createdAt: item.createdAt
                  ? item.createdAt.replace('T', ' ').substring(0, 19)
                  : formatCurrentTime(),
              });
              hasNew = true;
            }
          });
          if (hasNew) {
            this.saveToStorage();
          }
        }
      } catch (err) {
        console.warn('[Notify] 同步最新公告异常:', err);
      }
    },

    /**
     * 安全注销与释放 SSE 连接
     */
    closeSSE() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.isConnected = false;
    },
  },
});
