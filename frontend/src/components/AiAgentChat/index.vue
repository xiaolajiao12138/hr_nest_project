<template>
  <div class="ai-agent-wrapper">
    <!-- 右下角简洁悬浮入口按钮 -->
    <transition name="fade-scale">
      <button
        v-if="!isOpen"
        type="button"
        class="floating-launcher-btn"
        title="打开 AI 助手"
        @click="openChatWindow"
      >
        <svg class="robot-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="10" rx="3" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <circle cx="9" cy="16" r="1" fill="currentColor" />
          <circle cx="15" cy="16" r="1" fill="currentColor" />
        </svg>
      </button>
    </transition>

    <!-- 展开的极简多会话对话面板 -->
    <transition name="chat-panel-fade">
      <div
        v-if="isOpen"
        class="chat-dialog-panel"
        :class="{ 'with-sidebar': isSidebarOpen }"
      >
        <!-- 窄屏模式下的侧边栏遮罩 -->
        <div
          v-if="isSidebarOpen"
          class="mobile-sidebar-backdrop"
          @click="isSidebarOpen = false"
        ></div>

        <!-- 左侧：新建会话 / 历史会话侧边栏 -->
        <aside v-show="isSidebarOpen" class="chat-sidebar">
          <div class="sidebar-top">
            <button
              type="button"
              class="new-session-btn"
              :disabled="isLoading"
              @click="handleStartNewSession"
            >
              <el-icon><Plus /></el-icon>
              <span>新建会话</span>
            </button>
          </div>

          <div class="sidebar-section-label">历史会话</div>

          <div class="session-list-scroll">
            <div v-if="sessionsLoading && sessionList.length === 0" class="sidebar-empty">
              加载中...
            </div>
            <div v-else-if="sessionList.length === 0" class="sidebar-empty">
              暂无历史会话
            </div>

            <div
              v-for="item in sessionList"
              :key="item.id"
              class="session-item"
              :class="{
                'is-active': currentSessionId === item.id,
                'is-disabled': isLoading && currentSessionId !== item.id,
              }"
              @click="handleSelectSession(item)"
            >
              <!-- 内联重命名输入框 -->
              <div
                v-if="editingSessionId === item.id"
                class="session-rename-box"
                @click.stop
              >
                <input
                  :ref="(el) => setRenameInputRef(el, item.id)"
                  v-model="editingTitle"
                  type="text"
                  class="rename-input"
                  maxlength="100"
                  @keydown.enter.prevent="confirmRenameSession(item)"
                  @keydown.esc.prevent="cancelRenameSession"
                  @blur="confirmRenameSession(item)"
                />
              </div>

              <!-- 常规会话项展示 -->
              <template v-else>
                <div class="session-info">
                  <div class="session-title" :title="item.title">
                    {{ item.title }}
                  </div>
                  <div class="session-time">
                    {{ formatSessionTime(item.lastMessageAt || item.createdAt) }}
                  </div>
                </div>

                <div class="session-item-actions" @click.stop>
                  <button
                    type="button"
                    class="mini-icon-btn"
                    title="重命名"
                    :disabled="isLoading"
                    @click="startRenameSession(item)"
                  >
                    <el-icon><Edit /></el-icon>
                  </button>
                  <button
                    type="button"
                    class="mini-icon-btn danger"
                    title="删除会话"
                    :disabled="isLoading"
                    @click="handleDeleteSession(item)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </aside>

        <!-- 右侧：主对话区 -->
        <div class="chat-main-area">
          <!-- 1. 极简顶栏 -->
          <div class="chat-dialog-header">
            <div class="header-left">
              <button
                type="button"
                class="sidebar-toggle-btn"
                :title="isSidebarOpen ? '收起历史会话栏' : '展开历史会话栏'"
                @click="isSidebarOpen = !isSidebarOpen"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
              </button>
              <span class="header-title" :title="currentSessionTitle">
                {{ currentSessionTitle }}
              </span>
            </div>

            <div class="header-actions">
              <el-button
                v-if="!isSidebarOpen"
                link
                class="header-action-btn"
                title="新建会话"
                :disabled="isLoading"
                @click="handleStartNewSession"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
              <el-button
                v-if="messageList.length > 0 && currentSessionId"
                link
                class="header-action-btn"
                title="清空当前会话消息"
                :disabled="isLoading"
                @click="clearCurrentSessionMessages"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
              <el-button
                link
                class="header-action-btn"
                title="关闭"
                @click="closeChatWindow"
              >
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
          </div>

          <!-- 2. 消息滚动区 -->
          <div ref="messagesScrollRef" class="chat-messages-container">
            <div v-if="messagesLoading" class="messages-loading-tip">
              正在加载会话记录...
            </div>

            <!-- 空对话状态 -->
            <div v-else-if="messageList.length === 0" class="empty-welcome">
              <div class="empty-greeting">
                您好，{{ userStore.userInfo?.realName || userStore.userInfo?.username || '' }}，有什么可以帮您？
              </div>
              <div
                v-if="capabilities?.promptSuggestions?.length"
                class="suggestions-list"
              >
                <button
                  v-for="(suggestion, idx) in capabilities.promptSuggestions"
                  :key="idx"
                  type="button"
                  class="suggestion-btn"
                  @click="useSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </button>
              </div>
            </div>

            <!-- 交互消息流（单气泡合一，无冗余时间戳） -->
            <template v-else>
              <div
                v-for="(msg, index) in messageList"
                :key="msg.id ?? index"
                class="message-row"
                :class="msg.role === 'user' ? 'is-user-row' : 'is-ai-row'"
              >
                <div v-if="msg.role === 'assistant'" class="msg-avatar ai-avatar">
                  AI
                </div>

                <div class="msg-bubble-card">
                  <!-- 同气泡内联加载态 -->
                  <div
                    v-if="
                      msg.role === 'assistant' &&
                      isLoading &&
                      index === messageList.length - 1 &&
                      !msg.content &&
                      !msg.confirmationAction
                    "
                    class="inline-loading"
                  >
                    <span class="typing-dots">
                      <i class="dot"></i>
                      <i class="dot"></i>
                      <i class="dot"></i>
                    </span>
                    <span class="loading-text">
                      {{ activeExecutingToolTitle || '思考中...' }}
                    </span>
                  </div>

                  <!-- 极简单行工具状态微标 -->
                  <div
                    v-if="msg.executedTools && msg.executedTools.length > 0 && (msg.content || !isLoading)"
                    class="tool-summary-line"
                  >
                    <span
                      v-for="(tool, tIdx) in msg.executedTools"
                      :key="tIdx"
                      class="tool-mini-tag"
                      :class="{ 'is-warn': !tool.success }"
                    >
                      {{ tool.success ? '✓' : '!' }} {{ tool.title }}
                    </span>
                  </div>

                  <!-- 消息正文 -->
                  <div
                    v-if="msg.role === 'assistant' && msg.content"
                    class="msg-markdown-content"
                    v-html="renderMarkdown(msg.content)"
                  ></div>
                  <div v-else-if="msg.role === 'user'" class="msg-text-content">
                    {{ msg.content }}
                  </div>

                  <!-- 高危删除二次确认轻量卡片 -->
                  <div v-if="msg.confirmationAction" class="confirmation-card">
                    <div class="confirm-prompt">
                      {{ msg.confirmationAction.prompt }}
                    </div>
                    <div v-if="!msg.isConfirmationHandled" class="confirm-actions">
                      <el-button
                        type="danger"
                        size="small"
                        :disabled="isLoading"
                        @click="handleConfirmAction(msg, true)"
                      >
                        确认删除
                      </el-button>
                      <el-button
                        size="small"
                        :disabled="isLoading"
                        @click="handleConfirmAction(msg, false)"
                      >
                        取消
                      </el-button>
                    </div>
                    <div v-else class="confirm-handled">已响应</div>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- 3. 极简底部输入栏 -->
          <div class="chat-dialog-footer">
            <div class="input-bar">
              <el-input
                ref="chatInputRef"
                v-model="inputMessage"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                placeholder="输入问题或指令，Enter 发送..."
                resize="none"
                :disabled="isLoading"
                @keydown.enter="handleEnterKey"
              />
              <el-button
                type="primary"
                class="send-btn"
                :loading="isLoading"
                :disabled="!inputMessage.trim() || isLoading"
                @click="sendMessage"
              >
                <el-icon v-if="!isLoading"><Promotion /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Plus, Edit, Delete, Close, Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import {
  chatWithAgentStreamApi,
  getAgentCapabilitiesApi,
  getAgentSessionsApi,
  getAgentSessionMessagesApi,
  renameAgentSessionApi,
  deleteAgentSessionApi,
  clearAgentSessionMessagesApi,
  ChatMessageItem,
  AgentSessionItem,
  AgentCapabilitiesResult,
} from '@/api/agent';
import { renderMarkdown } from '@/utils/markdown';

const userStore = useUserStore();

const isOpen = ref<boolean>(false);
const isSidebarOpen = ref<boolean>(true);
const inputMessage = ref<string>('');
const isLoading = ref<boolean>(false);
const sessionsLoading = ref<boolean>(false);
const messagesLoading = ref<boolean>(false);
const activeExecutingToolTitle = ref<string>('');
const capabilities = ref<AgentCapabilitiesResult | null>(null);

const sessionList = ref<AgentSessionItem[]>([]);
const currentSessionId = ref<number | null>(null);
const messageList = ref<ChatMessageItem[]>([]);

// 会话内联重命名状态
const editingSessionId = ref<number | null>(null);
const editingTitle = ref<string>('');
const renameInputMap = new Map<number, HTMLInputElement>();

const messagesScrollRef = ref<HTMLDivElement | null>(null);
const chatInputRef = ref<any>(null);

const currentSessionTitle = computed<string>(() => {
  if (!currentSessionId.value) {
    return '新对话';
  }
  const matched = sessionList.value.find((s) => s.id === currentSessionId.value);
  return matched?.title || 'AI 助手';
});

/**
 * 清理旧版浏览器本地缓存遗留的聊天记录键
 */
const purgeLegacyLocalChatStorage = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hr_ai_agent_chat_history')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // 忽略浏览器隐私模式限制
  }
};

/**
 * 格式化侧边栏会话简短时间展示
 */
const formatSessionTime = (isoStr?: string): string => {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const pad = (n: number) => String(n).padStart(2, '0');
  if (isToday) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesScrollRef.value) {
      messagesScrollRef.value.scrollTop = messagesScrollRef.value.scrollHeight;
    }
  });
};

const loadCapabilities = async () => {
  try {
    capabilities.value = await getAgentCapabilitiesApi();
  } catch {
    // 静默兜底
  }
};

/**
 * 从后端加载当前用户的历史会话列表
 */
const loadSessionList = async (autoSelectLatest = false) => {
  sessionsLoading.value = true;
  try {
    const list = await getAgentSessionsApi();
    sessionList.value = Array.isArray(list) ? list : [];

    if (
      autoSelectLatest &&
      !currentSessionId.value &&
      sessionList.value.length > 0
    ) {
      await loadMessagesOfSession(sessionList.value[0].id);
    }
  } catch {
    sessionList.value = [];
  } finally {
    sessionsLoading.value = false;
  }
};

/**
 * 加载指定会话的数据库持久化消息
 */
const loadMessagesOfSession = async (sessionId: number) => {
  currentSessionId.value = sessionId;
  messagesLoading.value = true;
  try {
    const res = await getAgentSessionMessagesApi(sessionId);
    messageList.value = (res?.messages || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      executedTools: m.executedTools || undefined,
      confirmationAction: m.confirmationAction || undefined,
      isConfirmationHandled: Boolean(m.isConfirmationHandled),
      createdAt: m.createdAt,
    }));
    scrollToBottom();
  } catch (err: any) {
    ElMessage.error(err?.message || '加载历史会话消息失败');
  } finally {
    messagesLoading.value = false;
  }
};

const openChatWindow = async () => {
  isOpen.value = true;
  await loadSessionList(messageList.value.length === 0 && !currentSessionId.value);
  scrollToBottom();
};

const closeChatWindow = () => {
  isOpen.value = false;
};

/**
 * 点击“新建会话”：切回空白新对话状态（首条消息发送时自动在后端落库生成新会话）
 */
const handleStartNewSession = () => {
  if (isLoading.value) return;
  currentSessionId.value = null;
  messageList.value = [];
  editingSessionId.value = null;
  if (window.innerWidth <= 680) {
    isSidebarOpen.value = false;
  }
  nextTick(() => {
    chatInputRef.value?.focus?.();
  });
};

/**
 * 点击切换左侧历史会话
 */
const handleSelectSession = async (item: AgentSessionItem) => {
  if (isLoading.value) return;
  if (editingSessionId.value === item.id) return;
  if (currentSessionId.value === item.id && messageList.value.length > 0) {
    if (window.innerWidth <= 680) {
      isSidebarOpen.value = false;
    }
    return;
  }

  await loadMessagesOfSession(item.id);
  if (window.innerWidth <= 680) {
    isSidebarOpen.value = false;
  }
};

const setRenameInputRef = (el: any, sessionId: number) => {
  if (el) {
    renameInputMap.set(sessionId, el as HTMLInputElement);
  } else {
    renameInputMap.delete(sessionId);
  }
};

/**
 * 开启内联重命名
 */
const startRenameSession = (item: AgentSessionItem) => {
  if (isLoading.value) return;
  editingSessionId.value = item.id;
  editingTitle.value = item.title;
  nextTick(() => {
    const inputEl = renameInputMap.get(item.id);
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });
};

const cancelRenameSession = () => {
  editingSessionId.value = null;
  editingTitle.value = '';
};

const confirmRenameSession = async (item: AgentSessionItem) => {
  if (editingSessionId.value !== item.id) return;
  const newTitle = editingTitle.value.trim();
  editingSessionId.value = null;

  if (!newTitle || newTitle === item.title) {
    return;
  }

  try {
    const updated = await renameAgentSessionApi(item.id, newTitle);
    const target = sessionList.value.find((s) => s.id === item.id);
    if (target) {
      target.title = updated?.title || newTitle;
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '重命名会话失败');
  }
};

/**
 * 删除某条历史会话
 */
const handleDeleteSession = async (item: AgentSessionItem) => {
  if (isLoading.value) return;
  try {
    await deleteAgentSessionApi(item.id);
    const idx = sessionList.value.findIndex((s) => s.id === item.id);
    if (idx >= 0) {
      sessionList.value.splice(idx, 1);
    }

    if (currentSessionId.value === item.id) {
      const nextSession = sessionList.value[0];
      if (nextSession) {
        await loadMessagesOfSession(nextSession.id);
      } else {
        currentSessionId.value = null;
        messageList.value = [];
      }
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '删除会话失败');
  }
};

/**
 * 清空当前激活会话的消息记录
 */
const clearCurrentSessionMessages = async () => {
  if (isLoading.value || !currentSessionId.value) return;
  try {
    await clearAgentSessionMessagesApi(currentSessionId.value);
    messageList.value = [];
  } catch (err: any) {
    ElMessage.error(err?.message || '清空会话消息失败');
  }
};

/**
 * 将最新活跃的会话同步置顶到侧边栏列表
 */
const syncSessionToTop = (sessionId: number, title?: string) => {
  const nowIso = new Date().toISOString();
  const existingIdx = sessionList.value.findIndex((s) => s.id === sessionId);

  if (existingIdx >= 0) {
    const item = sessionList.value[existingIdx];
    if (title) {
      item.title = title;
    }
    item.lastMessageAt = nowIso;
    if (existingIdx > 0) {
      sessionList.value.splice(existingIdx, 1);
      sessionList.value.unshift(item);
    }
  } else {
    sessionList.value.unshift({
      id: sessionId,
      userId: Number(userStore.userInfo?.id || 0),
      title: title || '新对话',
      lastMessageAt: nowIso,
      createdAt: nowIso,
    });
  }
};

const useSuggestion = (suggestion: string) => {
  inputMessage.value = suggestion;
  sendMessage();
};

const handleEnterKey = (e: KeyboardEvent) => {
  if (e.shiftKey) return;
  e.preventDefault();
  sendMessage();
};

const handleConfirmAction = (msg: ChatMessageItem, isConfirmed: boolean) => {
  if (msg.isConfirmationHandled || isLoading.value) return;
  msg.isConfirmationHandled = true;

  const action = msg.confirmationAction;
  if (!action) return;

  inputMessage.value = isConfirmed
    ? `确认执行彻底删除【${action.targetName}】（ID: ${action.targetId}），请立即执行删除。`
    : `取消该操作，不予删除【${action.targetName}】。`;
  sendMessage();
};

const sendMessage = async () => {
  const text = inputMessage.value.trim();
  if (!text || isLoading.value) return;

  const historyPayload = messageList.value.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  messageList.value.push({
    role: 'user',
    content: text,
  });

  inputMessage.value = '';
  isLoading.value = true;
  activeExecutingToolTitle.value = '';

  const aiMsg: ChatMessageItem = {
    role: 'assistant',
    content: '',
    executedTools: [],
  };
  messageList.value.push(aiMsg);
  scrollToBottom();

  try {
    await chatWithAgentStreamApi(
      {
        message: text,
        sessionId: currentSessionId.value ?? undefined,
        history: historyPayload,
      },
      (event) => {
        if (event.type === 'session' && event.sessionId) {
          currentSessionId.value = event.sessionId;
          syncSessionToTop(event.sessionId, event.sessionTitle);
        } else if (event.type === 'tool_start') {
          activeExecutingToolTitle.value =
            event.toolTitle || event.toolName || '正在处理...';
          scrollToBottom();
        } else if (event.type === 'tool_end') {
          activeExecutingToolTitle.value = '';
          if (!aiMsg.executedTools) aiMsg.executedTools = [];
          aiMsg.executedTools.push({
            name: event.toolName,
            title: event.toolTitle,
            success: true,
            resultSummary: event.toolSummary || '已完成',
          });
          scrollToBottom();
        } else if (event.type === 'chunk') {
          aiMsg.content += event.content || '';
          scrollToBottom();
        } else if (event.type === 'done') {
          if (event.sessionId) {
            currentSessionId.value = event.sessionId;
            syncSessionToTop(event.sessionId, event.sessionTitle);
          }
          if (event.executedTools && event.executedTools.length > 0) {
            aiMsg.executedTools = event.executedTools;
          }
          if (event.confirmationAction) {
            aiMsg.confirmationAction = event.confirmationAction;
          }
          activeExecutingToolTitle.value = '';
          scrollToBottom();
        } else if (event.type === 'error') {
          ElMessage.error(event.message || '处理异常');
        }
      },
      (err) => {
        ElMessage.error(err.message || '连接中断');
        if (!aiMsg.content) {
          aiMsg.content = `请求异常：${err.message}`;
        }
      },
    );
  } catch (err: any) {
    aiMsg.content = `请求失败：${err.message || '网络异常'}`;
  } finally {
    isLoading.value = false;
    activeExecutingToolTitle.value = '';
    scrollToBottom();
  }
};

watch(
  () =>
    userStore.userInfo?.id ||
    userStore.userInfo?.userId ||
    userStore.userInfo?.username,
  async (newVal, oldVal) => {
    if (newVal && newVal !== oldVal) {
      currentSessionId.value = null;
      messageList.value = [];
      sessionList.value = [];
      loadCapabilities();
      if (isOpen.value) {
        await loadSessionList(true);
      }
    }
  },
);

watch(
  () => userStore.permissions,
  () => {
    loadCapabilities();
  },
);

onMounted(() => {
  purgeLegacyLocalChatStorage();
  loadCapabilities();
});
</script>

<style scoped>
.ai-agent-wrapper {
  position: relative;
  z-index: 2100;
}

/* 悬浮入口按钮：跟随系统主题色 */
.floating-launcher-btn {
  position: fixed;
  right: 24px;
  bottom: 28px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background-color: var(--el-color-primary, #409eff);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.floating-launcher-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
}

.robot-svg {
  width: 22px;
  height: 22px;
}

/* 多会话对话面板容器 */
.chat-dialog-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 410px;
  max-width: calc(100vw - 32px);
  height: 590px;
  max-height: calc(100vh - 48px);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.14);
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  transition: width 0.22s ease;
}

.chat-dialog-panel.with-sidebar {
  width: 620px;
}

.mobile-sidebar-backdrop {
  display: none;
}

/* ==================== 左侧：新建会话 / 历史会话侧边栏 ==================== */
.chat-sidebar {
  width: 196px;
  flex-shrink: 0;
  background: #f8fafc;
  border-right: 1px solid #eef0f4;
  display: flex;
  flex-direction: column;
  height: 100%;
  z-index: 3;
}

.sidebar-top {
  padding: 10px 10px 8px;
  flex-shrink: 0;
}

.new-session-btn {
  width: 100%;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--el-color-primary-light-5, #a0cfff);
  background: #ffffff;
  color: var(--el-color-primary, #409eff);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.new-session-btn:hover:not(:disabled) {
  background-color: var(--el-color-primary-light-9, #ecf5ff);
  border-color: var(--el-color-primary, #409eff);
}

.new-session-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sidebar-section-label {
  padding: 2px 12px 6px;
  font-size: 11px;
  color: #9ca3af;
  font-weight: 500;
  flex-shrink: 0;
}

.session-list-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sidebar-empty {
  padding: 28px 8px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

.session-item {
  position: relative;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  transition: background-color 0.15s ease;
}

.session-item:hover {
  background-color: #eef2f6;
}

.session-item.is-active {
  background-color: var(--el-color-primary-light-9, #ecf5ff);
}

.session-item.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.session-info {
  min-width: 0;
  flex: 1;
}

.session-title {
  font-size: 12.5px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.session-item.is-active .session-title {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}

.session-time {
  font-size: 10.5px;
  color: #9ca3af;
  margin-top: 2px;
}

.session-item-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.session-item:hover .session-item-actions {
  display: inline-flex;
}

.mini-icon-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.mini-icon-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: #1f2937;
}

.mini-icon-btn.danger:hover:not(:disabled) {
  background: #fee2e2;
  color: #dc2626;
}

.session-rename-box {
  width: 100%;
}

.rename-input {
  width: 100%;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid var(--el-color-primary, #409eff);
  border-radius: 5px;
  outline: none;
  box-sizing: border-box;
}

/* ==================== 右侧：主对话区 ==================== */
.chat-main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
}

/* 极简浅色顶栏 */
.chat-dialog-header {
  height: 46px;
  padding: 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.header-left {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-toggle-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.sidebar-toggle-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.sidebar-toggle-btn svg {
  width: 16px;
  height: 16px;
}

.header-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.header-action-btn {
  color: #9ca3af !important;
  font-size: 15px;
  padding: 4px;
}

.header-action-btn:hover {
  color: #374151 !important;
}

/* 消息滚动容器：禁止外层横向滚动条 */
.chat-messages-container {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.messages-loading-tip {
  margin: auto;
  font-size: 12.5px;
  color: #9ca3af;
}

/* 空对话简洁引导 */
.empty-welcome {
  margin: auto 0;
  padding: 12px 6px;
}

.empty-greeting {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-btn {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
  color: #4b5563;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.suggestion-btn:hover {
  border-color: var(--el-color-primary, #409eff);
  color: var(--el-color-primary, #409eff);
}

/* 消息气泡行 */
.message-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 100%;
}

.is-user-row {
  justify-content: flex-end;
}

.is-ai-row {
  justify-content: flex-start;
}

.msg-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.ai-avatar {
  background-color: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
}

.msg-bubble-card {
  min-width: 0;
  max-width: calc(100% - 36px);
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.is-user-row .msg-bubble-card {
  max-width: 82%;
  background-color: var(--el-color-primary, #409eff);
  color: #ffffff;
  border-bottom-right-radius: 3px;
}

.is-ai-row .msg-bubble-card {
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #ebedf0;
  border-bottom-left-radius: 3px;
}

/* 同气泡内加载动画 */
.inline-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}

.typing-dots {
  display: inline-flex;
  gap: 3px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: var(--el-color-primary, #409eff);
  animation: dot-bounce 1.2s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.15s;
}

.dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dot-bounce {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* 极简工具状态微标 */
.tool-summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.tool-mini-tag {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 1px 7px;
  border-radius: 4px;
}

.tool-mini-tag.is-warn {
  color: #b45309;
  background: #fef3c7;
}

/* 二次确认卡片 */
.confirmation-card {
  margin-top: 8px;
  padding: 8px 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}

.confirm-prompt {
  font-size: 12px;
  color: #92400e;
  margin-bottom: 8px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.confirm-handled {
  font-size: 11px;
  color: #6b7280;
}

/* 极简底部输入栏 */
.chat-dialog-footer {
  padding: 10px 12px;
  background: #ffffff;
  border-top: 1px solid #f0f2f5;
  flex-shrink: 0;
}

.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 5px 6px 5px 10px;
  background: #ffffff;
  transition: border-color 0.2s ease;
}

.input-bar:focus-within {
  border-color: var(--el-color-primary, #409eff);
}

:deep(.input-bar .el-textarea__inner) {
  border: none !important;
  box-shadow: none !important;
  padding: 3px 0 !important;
  font-size: 13px;
  color: #1f2937;
  background: transparent !important;
}

.send-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
  flex-shrink: 0;
}

/* Markdown 内容紧凑表格排版 */
:deep(.agent-table-wrapper) {
  max-width: 100%;
  overflow-x: auto;
  margin: 6px 0;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

:deep(.agent-data-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

:deep(.agent-data-table th) {
  background-color: #f9fafb;
  color: #374151;
  padding: 5px 8px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}

:deep(.agent-data-table td) {
  padding: 5px 8px;
  border-bottom: 1px solid #f3f4f6;
  color: #1f2937;
}

:deep(.agent-data-table tr:last-child td) {
  border-bottom: none;
}

:deep(.agent-code-block) {
  background-color: #111827;
  color: #e5e7eb;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  margin: 6px 0;
}

:deep(.agent-inline-code) {
  background-color: #f3f4f6;
  color: #d97706;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.agent-paragraph) {
  margin: 0 0 6px 0;
}

:deep(.agent-paragraph:last-child) {
  margin-bottom: 0;
}

:deep(.agent-list) {
  margin: 4px 0;
  padding-left: 18px;
}

:deep(.agent-list-item) {
  margin-bottom: 3px;
}

:deep(.agent-heading) {
  margin: 6px 0 4px 0;
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
}

/* 窄屏自适应：侧边栏转为左侧浮层抽屉，不挤压主聊天区 */
@media (max-width: 680px) {
  .chat-dialog-panel,
  .chat-dialog-panel.with-sidebar {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    height: calc(100vh - 36px);
  }

  .chat-sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 210px;
    box-shadow: 6px 0 20px rgba(0, 0, 0, 0.1);
  }

  .mobile-sidebar-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.2);
    z-index: 2;
  }
}

/* 轻量过渡动画 */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.chat-panel-fade-enter-active,
.chat-panel-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.chat-panel-fade-enter-from,
.chat-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
