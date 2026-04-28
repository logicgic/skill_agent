import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'

describe('App', () => {
  it('renders chat page with input and send button', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Skill Agent')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button.send-button').exists()).toBe(true)
  })

  it('renders assistant markdown structure and keeps table after emoji cleanup', async () => {
    const wrapper = mount(App)

    /**
     * 注入一条 assistant 消息，覆盖标题 + 表格 + emoji 场景。
     * 目标：验证去图标后仍保留 Markdown 多行结构，最终可渲染为 table。
     */
    ;(wrapper.vm as any).messages.push({
      role: 'assistant',
      content: ['# 标题😀', '', '| 列1 | 列2 |', '| --- | --- |', '| A | B🚀 |'].join('\n'),
    })
    await nextTick()

    expect(wrapper.find('.markdown-body h1').exists()).toBe(true)
    expect(wrapper.find('.markdown-body table').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('😀')
    expect(wrapper.text()).not.toContain('🚀')
  })
})
