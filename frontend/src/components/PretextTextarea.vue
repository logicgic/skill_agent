<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { prepare, layout } from '@chenglou/pretext'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const computedHeight = ref(40) // 初始高度
const minHeight = 40
const maxHeight = 200

// 字体设置，必须与 CSS 保持完全一致，pretext 才能准确测量
const fontSetting = '14px Arial, sans-serif'
const lineHeight = 20 // CSS 行高，需一致
const paddingY = 20 // 上下 padding 总和 (10px * 2)

/**
 * 统一收敛高度边界，避免重复写最小/最大值判断。
 */
const clampHeight = (height: number): number => {
  if (height < minHeight) return minHeight
  if (height > maxHeight) return maxHeight
  return height
}

const updateHeight = () => {
  if (!textareaRef.value) return

  const text = props.modelValue || props.placeholder || ''
  
  // 1. 获取容器的实际宽度（减去左右 padding 和 border）
  const styles = window.getComputedStyle(textareaRef.value)
  const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
  const borderX = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth)
  const boxWidth = textareaRef.value.offsetWidth
  const contentWidth = boxWidth - paddingX - borderX

  if (contentWidth <= 0) return

  try {
    // 2. 使用 pretext 准备文本，保持空白字符格式
    const prepared = prepare(text, fontSetting, { whiteSpace: 'pre-wrap' })
    
    // 3. 使用 pretext 计算高度
    const { height: textHeight } = layout(prepared, contentWidth, lineHeight)
    computedHeight.value = clampHeight(textHeight + paddingY)
  } catch {
    /**
     * 兜底策略（测试环境常见）：
     * 当运行环境不支持 canvas 文本测量时，退化为按换行数估算高度，
     * 保障组件在单测与极端环境下仍可用。
     */
    const lineCount = Math.max(1, text.split('\n').length)
    const estimatedHeight = lineCount * lineHeight + paddingY
    computedHeight.value = clampHeight(estimatedHeight)
  }
}

// 监听输入值变化，更新高度
watch(() => props.modelValue, () => {
  nextTick(updateHeight)
})

// 监听窗口缩放，因为宽度变了高度也会变
onMounted(() => {
  updateHeight()
  window.addEventListener('resize', updateHeight)
})

/**
 * 清理窗口事件监听，避免组件卸载后残留监听器。
 */
onUnmounted(() => {
  window.removeEventListener('resize', updateHeight)
})

const onInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

const onKeydown = (event: KeyboardEvent) => {
  emit('keydown', event)
}
</script>

<template>
  <textarea
    ref="textareaRef"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :style="{ height: `${computedHeight}px` }"
    class="pretext-textarea"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.pretext-textarea {
  width: 100%;
  /* 必须与 JS 中的测量参数完全一致 */
  font-family: Arial, sans-serif;
  font-size: 14px;
  line-height: 20px;
  padding: 10px 12px;
  
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background-color: #ffffff;
  color: #111827;
  resize: none; /* 禁止手动缩放，由 pretext 接管 */
  overflow-y: auto; /* 超过最大高度时显示滚动条 */
  box-sizing: border-box;
  transition: border-color 0.2s ease;
  outline: none;
}

.pretext-textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.pretext-textarea:disabled {
  background-color: #f3f4f6;
  cursor: not-allowed;
  opacity: 0.7;
}

/* 隐藏滚动条让 UI 更清爽，但保留滚动功能 (可选) */
.pretext-textarea::-webkit-scrollbar {
  width: 6px;
}
.pretext-textarea::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 3px;
}
</style>
