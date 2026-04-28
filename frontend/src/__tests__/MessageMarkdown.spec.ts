import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageMarkdown from '../components/MessageMarkdown.vue'

describe('MessageMarkdown', () => {
  it('renders full markdown structures correctly', () => {
    /**
     * 覆盖完整 Markdown 能力：
     * - 标题、列表、表格、代码块、引用、段内换行。
     */
    const markdownText = [
      '# 一级标题',
      '',
      '- 列表项A',
      '- 列表项B',
      '',
      '| 列1 | 列2 |',
      '| --- | --- |',
      '| A | B |',
      '',
      '> 引用内容',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '第一行',
      '第二行',
    ].join('\n')

    const wrapper = mount(MessageMarkdown, {
      props: {
        content: markdownText,
      },
    })

    expect(wrapper.find('h1').text()).toBe('一级标题')
    expect(wrapper.findAll('li').length).toBe(2)
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('blockquote').text()).toContain('引用内容')
    expect(wrapper.find('pre code').text()).toContain('const x = 1')
    expect(wrapper.html()).toContain('<br>')
  })
})
