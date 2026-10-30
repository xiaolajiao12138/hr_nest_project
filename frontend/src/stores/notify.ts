import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';
import router from '@/router';
import { getToken } from '@/utils/auth';
import { getLeavePendingCountApi } from '@/api/leave';
import { getLatestNoticesApi } from '@/api/ops';
import { useUserStore } from './user';
import { usePermissionStore } from './permission';

/**
 * 前端应用内通知消息结构接口
 */
export interface AppMessage {
  /** 消息唯一标识 ID */
  id: string;
  /** 消息标题 */
  title: string;
  /** 消息主体正文内容 */
  content: string;
  /** 消息分类：LEAVE（请假审批提醒）或 NOTICE（系统/全员公告） */
  type: 'LEAVE' | 'NOTICE';
  /** 点击该消息后路由跳转的目标页面地址 */
  actionUrl: string;
  /** 是否已被用户阅读 */
  isRead: boolean;
  /** 消息产生并存入的时间字符串 (YYYY-MM-DD HH:mm:ss) */
  createdAt: string;
}

/**
 * SSE 服务端下发推送报文载荷规范接口
 */
export interface SseMessageData {
  /** 推送事件类型代码 */
  type:
    | 'NOTICE_BROADCAST'
    | 'LEAVE_AUDIT_NOTIFY'
    | 'TODO_BADGE_UPDATE'
    | 'HEARTBEAT'
    | 'PERMISSION_UPDATE';
  /** 消息标题 */
  title?: string;
  /** 消息正文 */
  message?: string;
  /** 业务附加实体载荷 */
  data?: any;
  /** 服务端产生时间戳 */
  timestamp?: number;
}

/** 本地持久化存储 LocalStorage 的键名 */
const STORAGE_KEY = 'hr_user_notifications';

/**
 * 格式化当前本地系统时间为标准展示格式 (YYYY-MM-DD HH:mm:ss)
 *
 * @returns 格式化后的时间字符串
 */
function formatCurrentTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * 全局消息通知与 SSE 实时通讯 Pinia Store
 * 管理实时长连接、全员公告广播接收、请假审批状态提醒、待办徽标统计以及本地已读未读消息中心
 */
export const useNotifyStore = defineStore('notify', {
  state: () => ({
    /** 待审批请假任务总数（服务端真实统计并由 SSE 实时更新） */
    pendingLeaveCount: 0,
    /** 本地留存的消息通知历史列表 */
    messages: [] as AppMessage[],
    /** 原生 EventSource 实例句柄 */
    eventSource: null as EventSource | null,
    /** 当前 SSE 长连接是否就绪 */
    isConnected: false,
    /** 断线重连定时器句柄 */
    reconnectTimer: null as any,
  }),

  getters: {
    /**
     * 计算当前未读消息总量
     * 用于顶部 Header 铃铛右上方红色角标展示
     */
    unreadCount: (state): number => {
      return state.messages.filter((m) => !m.isRead).length;
    },
  },

  actions: {
    /**
     * 从浏览器 LocalStorage 读取历史消息数据
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
     * 将当前消息列表同步持久化至浏览器 LocalStorage
     */
    saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
      } catch (e) {
        console.warn('[Notify] 本地消息存储失败', e);
      }
    },

    /**
     * 向消息列表头部压入一条新通知
     * 自动分配随机 ID、初始化未读状态，并自动维持最多 50 条历史记录以防内存膨胀
     *
     * @param msg 消息核心属性载荷
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
     * 将指定 ID 的消息标记为已读状态
     *
     * @param id 消息唯一标识 ID
     */
    markAsRead(id: string) {
      const target = this.messages.find((m) => m.id === id);
      if (target && !target.isRead) {
        target.isRead = true;
        this.saveToStorage();
      }
    },

    /**
     * 一键将全部通知标记为已读状态
     */
    markAllAsRead() {
      this.messages.forEach((m) => {
        m.isRead = true;
      });
      this.saveToStorage();
    },

    /**
     * 从消息中心删除指定 ID 的单条通知
     *
     * @param id 待删除消息的唯一标识 ID
     */
    removeMessage(id: string) {
      this.messages = this.messages.filter((m) => m.id !== id);
      this.saveToStorage();
    },

    /**
     * 一键清空消息中心的所有历史通知
     */
    clearAll() {
      this.messages = [];
      this.saveToStorage();
    },

    /**
     * 初始化 SSE (Server-Sent Events) 服务端实时长连接通道
     * 携带 JWT Token 发起连接，注册连接成功、接收消息、错误重连等生命周期监听器
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
     * 深度解析数据结构，触发顶部/右下角弹窗通知并更新消息中心
     *
     * @param rawPayload 服务端下发的原始 JSON 对象
     */
    handleSseMessage(rawPayload: any) {
      if (!rawPayload) return;

      // 核心解包：防御式递归剥离后端拦截器嵌套包裹的 data.data 结构
      let payload: any = rawPayload;
      while (payload && payload.data && typeof payload.data === 'object' && payload.data.type) {
        payload = payload.data;
      }

      // 服务端心跳包直接静默处理
      if (payload.type === 'HEARTBEAT') {
        return;
      }

      // 业务场景 1: 发布全员新公告时，右上方弹窗实时触达，并持久化存入通知中心
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

      // 业务场景 2: 主管审批了请假申请 / 新提交请假，前端顶部弹窗提醒，并存入消息中心
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

      // 业务场景 3: 审批代办任务徽标数字变动，实现全员主管视图实时增减
      if (payload.type === 'TODO_BADGE_UPDATE') {
        if (payload.data && typeof payload.data.pendingCount === 'number') {
          this.pendingLeaveCount = payload.data.pendingCount;
        } else {
          this.fetchPendingCount();
        }
        return;
      }

      // 业务场景 4: 权限与菜单配置变更实时热重载（无需退出重新登录）
      if (payload.type === 'PERMISSION_UPDATE') {
        const userStore = useUserStore();
        const permissionStore = usePermissionStore();

        // 1. 静默拉取当前用户最新权限标识与角色
        userStore.getInfo().catch(() => {});

        // 2. 热重载路由与侧边栏导航菜单
        permissionStore.reloadRoutes(router).catch(() => {});

        // 3. 右上角轻量提示
        ElNotification({
          title: '系统权限已同步',
          message:
            payload.message || '系统岗位权限与功能配置已更新，功能菜单已自动为您对齐。',
          type: 'success',
          position: 'top-right',
          duration: 4000,
        });
        return;
      }
    },

    /**
     * 准确拉取最新的待审批请假真实数量
     * 调用后端专门轻量接口 GET /api/hr/leave/pending-count
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
     * 初始同步最近发布的系统公告
     * 确保即使用户在公告发布时处于离线状态，登录系统后也能在消息中心自动补充最新公告
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
     * 安全注销与释放 SSE 连接资源
     * 页面登出或离开系统时调用，防止后台内存泄露或无效连接重连
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
