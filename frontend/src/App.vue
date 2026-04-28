<script setup lang="ts">
import { ref } from 'vue'

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
 * 统一后端接口地址，默认指向本地后端服务。
 */
const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3001'

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
          }
          if (event.type === 'meta') {
            messages.value.push({ role: 'meta', content: event.content })
          }
        }
      }
    }
  } catch (error) {
    messages.value.push({
      role: 'meta',
      content: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="container">
    <h1 class="title">Skill Agent 聊天页</h1>

    <section class="chat-panel">
      <div v-for="(message, index) in messages" :key="index" class="message" :data-role="message.role">
        <strong>{{ message.role }}:</strong>
        <span>{{ message.content }}</span>
      </div>
    </section>

    <section class="input-panel">
      <textarea
        v-model="inputText"
        placeholder="输入你的问题，例如：请解析 files 下的 PDF 文件"
        class="input-box"
      />
      <button :disabled="loading" class="send-button" @click="sendMessage">
        {{ loading ? '发送中...' : '发送' }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.container {
  min-height: 100vh;
  padding: 20px;
  background: #ffffff;
  color: #111111;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: Arial, sans-serif;
}

.title {
  margin: 0;
}

.chat-panel {
  border: 1px solid #dddddd;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
  min-height: 360px;
  max-height: 520px;
  overflow-y: auto;
}

.message {
  margin-bottom: 10px;
  line-height: 1.6;
}

.input-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-box {
  width: 100%;
  min-height: 110px;
  border: 1px solid #cccccc;
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  resize: vertical;
}

.send-button {
  width: 120px;
  border: 1px solid #cccccc;
  border-radius: 8px;
  background: #ffffff;
  color: #111111;
  padding: 8px 12px;
  cursor: pointer;
}

.send-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
