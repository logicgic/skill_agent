<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const props = defineProps<{
  /**
   * AI 原始回答文本（Markdown 格式）。
   */
  content: string
}>()

/**
 * Markdown 渲染器实例：
 * - 启用 html=false，禁止原始 HTML 直出，降低注入风险。
 * - 启用 linkify/typographer，提升自然文本可读性。
 * - breaks=true，让单行换行按段内换行渲染。
 */
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

/**
 * 渲染后的安全 HTML：
 * 1) 先用 markdown-it 把 Markdown 转成 HTML；
 * 2) 再用 DOMPurify 做白名单净化；
 * 3) 最终用于 v-html 安全渲染。
 */
const renderedHtml = computed(() => {
  const rawHtml = markdownRenderer.render(props.content ?? '')
  return DOMPurify.sanitize(rawHtml)
})
</script>

<template>
  <div class="markdown-body" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-body {
  font-size: 0.95rem;
  line-height: 1.7;
  color: inherit;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 0.75rem 0 0.5rem;
  font-weight: 700;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 1.35rem;
}

.markdown-body :deep(h2) {
  font-size: 1.2rem;
}

.markdown-body :deep(h3) {
  font-size: 1.05rem;
}

.markdown-body :deep(p) {
  margin: 0.5rem 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.35rem;
}

.markdown-body :deep(li) {
  margin: 0.2rem 0;
}

.markdown-body :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.5rem 0.8rem;
  border-left: 4px solid #d1d5db;
  background: #f9fafb;
  color: #4b5563;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.9rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #d1d5db;
  padding: 0.4rem 0.55rem;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: #f3f4f6;
  font-weight: 600;
}

.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.86em;
  background: #f3f4f6;
  padding: 0.12em 0.35em;
  border-radius: 6px;
}

.markdown-body :deep(pre) {
  margin: 0.75rem 0;
  padding: 0.8rem;
  border-radius: 10px;
  background: #111827;
  color: #f9fafb;
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}

.markdown-body :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid #e5e7eb;
  margin: 1rem 0;
}
</style>
