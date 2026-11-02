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

    <!-- 展开的极简对话面板 -->
    <transition name="chat-panel-fade">
      <div v-if="isOpen" class="chat-dialog-panel">
        <!-- 1. 极简顶栏：仅保留图标、标题与清空/关闭按钮 -->
        <div class="chat-dialog-header">
          <div class="header-left">
            <span class="header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="10" rx="3" />
                <circle cx="12" cy="5" r="2" />
                <path d="M12 7v4" />
              </svg>
            </span>
            <span class="header-title">AI 助手</span>
          </div>

          <div class="header-actions">
            <el-button
              v-if="messageList.length > 0"
              link
              class="header-action-btn"
              title="清空对话"
              @click="clearChatHistory"
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
          <!-- 空对话状态：仅在无消息时展示简洁问候与快捷提问 -->
          <div v-if="messageList.length === 0" class="empty-welcome">
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

          <!-- 交互消息流（单气泡合一，无冗余时间戳与双气泡） -->
          <div
            v-for="(msg, index) in messageList"
            :key="index"
            class="message-row"
            :class="msg.role === 'user' ? 'is-user-row' : 'is-ai-row'"
          >
            <div v-if="msg.role === 'assistant'" class="msg-avatar ai-avatar">
              AI
            </div>

            <div class="msg-bubble-card">
              <!-- 同气泡内联加载态：未返回正文前在同一气泡内展示精简状态，杜绝出现两个气泡 -->
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

              <!-- 极简单行工具状态微标（仅当有工具调用且已产生内容时低调展示） -->
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
                    @click="handleConfirmAction(msg, true)"
                  >
                    确认删除
                  </el-button>
                  <el-button
                    size="small"
                    @click="handleConfirmAction(msg, false)"
                  >
                    取消
                  </el-button>
                </div>
                <div v-else class="confirm-handled">已响应</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. 极简底部输入栏：无多余标语与分割线 -->
        <div class="chat-dialog-footer">
          <div class="input-bar">
            <el-input
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
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { Delete, Close, Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import {
  chatWithAgentStreamApi,
  getAgentCapabilitiesApi,
  ChatMessageItem,
  AgentCapabilitiesResult,
} from '@/api/agent';
import { renderMarkdown } from '@/utils/markdown';

const userStore = useUserStore();

const isOpen = ref<boolean>(false);
const inputMessage = ref<string>('');
const isLoading = ref<boolean>(false);
const activeExecutingToolTitle = ref<string>('');
const capabilities = ref<AgentCapabilitiesResult | null>(null);
const messageList = ref<ChatMessageItem[]>([]);
const messagesScrollRef = ref<HTMLDivElement | null>(null);

const getStorageKey = (): string => {
  const uid =
    userStore.userInfo?.id ||
    userStore.userInfo?.userId ||
    userStore.userInfo?.username ||
    'default';
  return `hr_ai_agent_chat_history_${uid}`;
};

const saveChatHistoryToStorage = () => {
  try {
    const recentMessages = messageList.value.slice(-50);
    localStorage.setItem(getStorageKey(), JSON.stringify(recentMessages));
  } catch {
    // 忽略本地存储配额异常
  }
};

const loadChatHistoryFromStorage = () => {
  try {
    const rawHistory = localStorage.getItem(getStorageKey());
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      messageList.value = Array.isArray(parsed) ? parsed : [];
      scrollToBottom();
    } else {
      messageList.value = [];
    }
  } catch {
    messageList.value = [];
  }
};

const loadCapabilities = async () => {
  try {
    capabilities.value = await getAgentCapabilitiesApi();
  } catch {
    // 静默兜底
  }
};

const openChatWindow = () => {
  isOpen.value = true;
  if (messageList.value.length === 0) {
    loadChatHistoryFromStorage();
  }
  scrollToBottom();
};

const closeChatWindow = () => {
  isOpen.value = false;
};

const clearChatHistory = () => {
  messageList.value = [];
  try {
    localStorage.removeItem(getStorageKey());
  } catch {
    // 忽略异常
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

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesScrollRef.value) {
      messagesScrollRef.value.scrollTop = messagesScrollRef.value.scrollHeight;
    }
  });
};

const handleConfirmAction = (msg: ChatMessageItem, isConfirmed: boolean) => {
  if (msg.isConfirmationHandled) return;
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

  // 先提取不包含本次新消息的前序历史记录
  const historyPayload = messageList.value.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  messageList.value.push({
    role: 'user',
    content: text,
  });
  saveChatHistoryToStorage();

  inputMessage.value = '';
  isLoading.value = true;
  activeExecutingToolTitle.value = '';

  // 仅创建一个 AI 回复气泡，加载动画与正文均在此气泡内渲染
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
        history: historyPayload,
      },
      (event) => {
        if (event.type === 'tool_start') {
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
    saveChatHistoryToStorage();
    scrollToBottom();
  }
};

watch(
  () =>
    userStore.userInfo?.id ||
    userStore.userInfo?.userId ||
    userStore.userInfo?.username,
  (newVal, oldVal) => {
    if (newVal && newVal !== oldVal) {
      loadChatHistoryFromStorage();
      loadCapabilities();
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
  loadChatHistoryFromStorage();
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

/* 对话面板容器 */
.chat-dialog-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: 580px;
  max-height: calc(100vh - 48px);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.14);
  border: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 极简浅色顶栏 */
.chat-dialog-header {
  height: 48px;
  padding: 0 14px;
  background: #ffffff;
  border-bottom: 1px solid #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background-color: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-icon svg {
  width: 16px;
  height: 16px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 6px 0;
}

:deep(.agent-inline-code) {
  background-color: #f3f4f6;
  color: #374151;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

:deep(.agent-bold) {
  font-weight: 600;
}

:deep(.agent-p) {
  margin: 4px 0;
}

:deep(.agent-list-item) {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 0;
}

:deep(.agent-list-dot),
:deep(.agent-list-num) {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}

:deep(.agent-h2),
:deep(.agent-h3),
:deep(.agent-h4) {
  font-weight: 600;
  font-size: 13.5px;
  color: #111827;
  margin: 6px 0 4px 0;
}

:deep(.agent-quote) {
  border-left: 3px solid var(--el-color-primary, #409eff);
  padding-left: 8px;
  color: #4b5563;
  margin: 4px 0;
}

/* 过渡动画 */
.fade-scale-enter-active,
.fade-scale-leave-active,
.chat-panel-fade-enter-active,
.chat-panel-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to,
.chat-panel-fade-enter-from,
.chat-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
</style>
