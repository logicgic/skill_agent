import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('renders chat input and send button', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Skill Agent 聊天页')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('button').text()).toContain('发送')
  })
})
