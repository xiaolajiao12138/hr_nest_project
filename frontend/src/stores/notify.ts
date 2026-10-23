import { defineStore } from 'pinia';
import { ElNotification } from 'element-plus';
import { getToken } from '@/utils/auth';
import { getDashboardStatsApi } from '@/api/dashboard';

export interface SseMessageData {
  type: 'NOTICE_BROADCAST' | 'LEAVE_AUDIT_NOTIFY' | 'TODO_BADGE_UPDATE' | 'HEARTBEAT';
  title?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

export const useNotifyStore = defineStore('notify', {
  state: () => ({
    // 待审批请假待办数量 (实时与后端同步)
    pendingLeaveCount: 0,
    // EventSource 实例引用
    eventSource: null as EventSource | null,
    // 当前 SSE 连接就绪状态
    isConnected: false,
    // 重连定时器
    reconnectTimer: null as any,
  }),

  actions: {
    /**
     * 初始化 SSE 实时事件流连接
     */
    initSSE() {
      const token = getToken();
      if (!token) return;

      // 如果已有连接，先优雅关闭
      this.closeSSE();

      try {
        const prefix = import.meta.env.VITE_API_PREFIX || '/api';
        const sseUrl = `${prefix}/sse/stream?token=${encodeURIComponent(token)}`;

        const es = new EventSource(sseUrl);
        this.eventSource = es;

        es.onopen = () => {
          this.isConnected = true;
          console.log('[SSE] 实时通讯与推送通道已建立');
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
        };

        es.onmessage = (event) => {
          if (!event.data) return;
          try {
            const payload: SseMessageData = JSON.parse(event.data);
            this.handleSseMessage(payload);
          } catch (err) {
            console.warn('[SSE] 解析推送消息格式异常:', err);
          }
        };

        es.onerror = (err) => {
          console.warn('[SSE] 推送通道连接异常或已断开，准备重连...', err);
          this.closeSSE();
          // 8 秒后自动尝试重连
          if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              this.initSSE();
            }, 8000);
          }
        };

        // 初始拉取一次最新的待办数量
        this.fetchPendingCount();
      } catch (e) {
        console.error('[SSE] 启动异常:', e);
      }
    },

    /**
     * 分发处理各类实时业务推送事件
     */
    handleSseMessage(payload: SseMessageData) {
      if (payload.type === 'HEARTBEAT') {
        // 心跳包，保持长连接活性
        return;
      }

      // 场景 1: 发布全员新公告时，右下角弹窗实时触达
      if (payload.type === 'NOTICE_BROADCAST') {
        ElNotification({
          title: payload.title || '系统新公告发布',
          message: payload.message || '您有一条新的企业公告，请注意查阅！',
          type: 'info',
          position: 'bottom-right',
          duration: 6000,
        });
        return;
      }

      // 场景 2: 主管审批了请假申请 / 新提交请假，前端顶部弹窗提醒
      if (payload.type === 'LEAVE_AUDIT_NOTIFY') {
        const isReject = payload.data?.action === 'REJECTED';
        ElNotification({
          title: payload.title || '请假审批提醒',
          message: payload.message || '请假流程审批状态已更新',
          type: isReject ? 'warning' : 'success',
          position: 'top-right',
          duration: 5000,
        });
        return;
      }

      // 场景 3: 审批代办任务徽标（Badge）数字实时递减/递增
      if (payload.type === 'TODO_BADGE_UPDATE') {
        if (payload.data && typeof payload.data.pendingCount === 'number') {
          this.pendingLeaveCount = payload.data.pendingCount;
        }
      }
    },

    /**
     * 初始拉取最新待办统计数据
     */
    async fetchPendingCount() {
      try {
        const res = await getDashboardStatsApi();
        if (res && res.overview && typeof res.overview.pendingLeaves === 'number') {
          this.pendingLeaveCount = res.overview.pendingLeaves;
        }
      } catch (err) {
        // 降级静默处理
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
