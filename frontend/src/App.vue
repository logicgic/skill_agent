<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import PretextTextarea from './components/PretextTextarea.vue'
import MessageMarkdown from './components/MessageMarkdown.vue'
import StructuredTable, { type TableSectionsPayload } from './components/StructuredTable.vue'

/**
 * 用户输入文本框绑定值。
 */
const inputText = ref('')

/**
 * 聊天记录数组，按时间顺序展示。
 */
const messages = ref<Array<{ role: 'user' | 'assistant' | 'meta'; content: string }>>([])

/**
 * 当前请求是否处理中，用于按钮禁用状态。
 */
const loading = ref(false)
/**
 * 结构化表格事件列表。
 * 后端每次返回 table_data 事件时追加一条，用于展示完整表格数据。
 */
const tableSectionsEvents = ref<TableSectionsPayload[]>([])

/**
 * 聊天滚动容器引用，用于流式更新时自动滚动到底部。
 */
const chatContainerRef = ref<HTMLElement | null>(null)

/**
 * 滚动到底部
 */
const scrollToBottom = async () => {
  await nextTick()
  if (chatContainerRef.value) {
    chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
  }
}

/**
 * 统一后端接口地址，默认指向本地后端服务。
 */
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3001'

/**
 * 用于识别并过滤常见 emoji / 图标字符。
 * 说明：前端做一层显示兜底，防止任何链路漏网字符出现在界面上。
 */
const emojiRegex =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu

/**
 * 去除文本中的 emoji/小图标字符。
 * 注意：这里只做字符级过滤，不做空白压缩，避免破坏 Markdown 的换行与表格结构。
 */
const removeEmoji = (text: string): string => text.replace(emojiRegex, '')

/**
 * 计算属性：对消息内容做无图标兜底净化后再展示。
 */
const sanitizedMessages = computed(() =>
  messages.value.map((message) => ({
    ...message,
    content: removeEmoji(message.content),
  })),
)

/**
 * 将 SSE 数据块按行切分并提取 JSON 事件。
 */
const parseSseEvents = (rawChunk: string): Array<{ type: string; content: string }> => {
  return rawChunk
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => {
      const payload = block.slice('data: '.length)
      return JSON.parse(payload) as { type: string; content: string }
    })
}

/**
 * 发起一次聊天请求并流式更新回答文本。
 */
const sendMessage = async (): Promise<void> => {
  if (!inputText.value.trim() || loading.value) {
    return
  }

  const userContent = inputText.value.trim()
  inputText.value = ''
  loading.value = true

  messages.value.push({ role: 'user', content: userContent })
  const assistantMessage = { role: 'assistant' as const, content: '' }
  messages.value.push(assistantMessage)

  try {
    const response = await fetch(`${backendUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'default-session',
        message: userContent,
      }),
    })

    if (!response.ok || !response.body) {
      throw new Error('后端返回异常，无法建立流式连接')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let pending = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      pending += decoder.decode(value, { stream: true })
      const chunks = pending.split('\n\n')
      pending = chunks.pop() ?? ''

      for (const chunk of chunks) {
        const events = parseSseEvents(chunk)
        for (const event of events) {
          if (event.type === 'chunk') {
            assistantMessage.content += event.content
            scrollToBottom()
          }
          if (event.type === 'meta') {
            messages.value.push({ role: 'meta', content: event.content })
            scrollToBottom()
          }
          if (event.type === 'table_data') {
            try {
              const parsed = JSON.parse(event.content) as TableSectionsPayload
              tableSectionsEvents.value.push(parsed)
            } catch {
              messages.value.push({ role: 'meta', content: 'table_data 解析失败' })
            }
            scrollToBottom()
          }
          if (event.type === 'error') {
            messages.value.push({ role: 'meta', content: event.content })
            scrollToBottom()
          }
        }
      }
    }
  } catch (error) {
    messages.value.push({
      role: 'meta',
      content: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    })
    scrollToBottom()
  } finally {
    loading.value = false
  }
}

/**
 * 监听快捷键发送
 */
const handleKeydown = (e: KeyboardEvent) => {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <main class="container">
    <header class="header">
      <h1 class="title">Skill Agent</h1>
      <p class="subtitle">Powered by LlamaIndex & Vue 3 & Pretext</p>
    </header>

    <section class="chat-panel" ref="chatContainerRef">
      <div v-if="sanitizedMessages.length === 0" class="empty-state">
        <p>你好！我是 Skill Agent。</p>
        <p>我可以帮你处理各种文件、查询数据或编写代码。试试在下方输入你的问题。</p>
      </div>
      <div 
        v-for="(message, index) in sanitizedMessages" 
        :key="index" 
        class="message-wrapper" 
        :class="`wrapper-${message.role}`"
      >
        <div class="message-bubble" :class="`bubble-${message.role}`">
          <div class="message-role">{{ message.role === 'user' ? '你' : message.role === 'assistant' ? 'Agent' : '系统/Meta' }}</div>
          <div v-if="message.role === 'assistant'" class="message-content message-markdown">
            <MessageMarkdown :content="message.content" />
          </div>
          <div v-else class="message-content">{{ message.content }}</div>
        </div>
      </div>

      <StructuredTable
        v-for="(tableSections, index) in tableSectionsEvents"
        :key="`table-sections-${index}`"
        :table-sections="tableSections"
      />
    </section>

    <section class="input-panel">
      <div class="input-container">
        <PretextTextarea
          v-model="inputText"
          placeholder="输入你的问题，例如：请解析 files 下的 PDF 文件（Shift+Enter 换行）"
          :disabled="loading"
          @keydown="handleKeydown"
        />
        <button 
          :disabled="loading || !inputText.trim()" 
          class="send-button" 
          :class="{ 'is-loading': loading }"
          @click="sendMessage"
        >
          <svg v-if="!loading" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <svg v-else class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        </button>
      </div>
      <div class="footer-text">
        AI 生成的内容可能不准确，请注意核实。
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 现代化重置和基础样式 */
.container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f9fafb; /* bg-gray-50 */
  color: #111827; /* text-gray-900 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.header {
  padding: 16px 24px;
  background-color: white;
  border-bottom: 1px solid #e5e7eb;
  text-align: center;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.875rem;
  color: #6b7280;
}

/* 聊天区域 */
.chat-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  scroll-behavior: smooth;
}

.empty-state {
  margin: auto;
  text-align: center;
  color: #6b7280;
  max-width: 400px;
}

.empty-state p {
  margin: 8px 0;
}

/* 消息包装器，用于控制左右对齐 */
.message-wrapper {
  display: flex;
  width: 100%;
}

.wrapper-user {
  justify-content: flex-end;
}

.wrapper-assistant, .wrapper-meta {
  justify-content: flex-start;
}

/* 气泡样式 */
.message-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  position: relative;
  line-height: 1.6;
}

.message-role {
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.7;
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
}

/* AI 回答区域允许 Markdown 自定义排版，避免继承 pre-wrap 影响代码块布局 */
.message-markdown {
  white-space: normal;
}

/* 用户气泡 */
.bubble-user {
  background-color: #2563eb; /* blue-600 */
  color: white;
  border-bottom-right-radius: 4px;
}

/* AI气泡 */
.bubble-assistant {
  background-color: white;
  color: #111827;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Meta/思考过程气泡 */
.bubble-meta {
  background-color: #f3f4f6;
  color: #4b5563;
  font-family: monospace;
  font-size: 0.85rem;
  border: 1px dashed #d1d5db;
  border-bottom-left-radius: 4px;
}

/* 输入区域 */
.input-panel {
  padding: 16px 24px 24px;
  background-color: transparent;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.input-container {
  position: relative;
  display: flex;
  align-items: flex-end;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e7eb;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-container:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* 覆盖内部组件的边框 */
:deep(.pretext-textarea) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 12px;
  padding-right: 50px !important; /* 给按钮留出空间 */
}

.send-button {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
}

.send-button:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.send-button:active:not(:disabled) {
  transform: scale(0.95);
}

.send-button:disabled {
  background-color: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}

.footer-text {
  text-align: center;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 12px;
}

/* Loading Spinner 动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinner {
  animation: spin 1s linear infinite;
}
</style>
