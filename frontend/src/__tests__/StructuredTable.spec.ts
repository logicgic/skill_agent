import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StructuredTable from '../components/StructuredTable.vue'

describe('StructuredTable', () => {
  it('renders full headers and rows for selected tables', () => {
    const wrapper = mount(StructuredTable, {
      props: {
        tableSections: {
          requested_scope: '资产负债表',
          selected_tables: [
            {
              page: 10,
              table_index: 0,
              title_guess: '合并资产负债表',
              headers: ['项目', '期末余额', '期初余额'],
              rows: [
                ['货币资金', '1,000', '900'],
                ['应收账款', '200', '180'],
              ],
            },
          ],
          all_tables: [],
          unmatched_request: null,
        },
      },
    })

    expect(wrapper.text()).toContain('合并资产负债表')
    expect(wrapper.findAll('th').length).toBe(3)
    expect(wrapper.findAll('tbody tr').length).toBe(2)
    expect(wrapper.text()).toContain('货币资金')
    expect(wrapper.text()).toContain('应收账款')
  })
})
