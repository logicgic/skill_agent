<script setup lang="ts">
export interface StructuredTableItem {
  page: number
  table_index: number
  title_guess?: string
  headers: string[]
  rows: string[][]
}

export interface TableSectionsPayload {
  requested_scope: string
  selected_tables: StructuredTableItem[]
  all_tables: StructuredTableItem[]
  unmatched_request: string | null
}

const props = defineProps<{
  /**
   * 后端 table_data 事件的结构化表格负载。
   */
  tableSections: TableSectionsPayload
}>()

/**
 * 展示策略：
 * - 如果命中了指定表格，优先展示 selected_tables；
 * - 否则展示 all_tables（满足“提取全部表格”场景）。
 */
const getVisibleTables = (): StructuredTableItem[] => {
  if (props.tableSections.selected_tables.length > 0) {
    return props.tableSections.selected_tables
  }
  return props.tableSections.all_tables
}
</script>

<template>
  <section class="structured-table">
    <header class="table-header">
      <h3>结构化表格结果</h3>
      <p>请求范围：{{ tableSections.requested_scope }}</p>
      <p v-if="tableSections.unmatched_request" class="warn-text">{{ tableSections.unmatched_request }}</p>
    </header>

    <div
      v-for="(table, index) in getVisibleTables()"
      :key="`${table.page}-${table.table_index}-${index}`"
      class="table-card"
    >
      <h4 class="table-title">{{ table.title_guess || `表格 ${index + 1}` }}</h4>
      <p class="table-meta">页码：{{ table.page }}，序号：{{ table.table_index }}</p>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th v-for="(header, hIndex) in table.headers" :key="`${hIndex}-${header}`">
                {{ header || `列${hIndex + 1}` }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rIndex) in table.rows" :key="`${rIndex}`">
              <td v-for="(cell, cIndex) in row" :key="`${rIndex}-${cIndex}`">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.structured-table {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #eff6ff;
}

.table-header h3 {
  margin: 0;
  font-size: 1rem;
}

.table-header p {
  margin: 4px 0 0;
  color: #334155;
  font-size: 0.85rem;
}

.warn-text {
  color: #b45309;
}

.table-card {
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
}

.table-title {
  margin: 0;
  font-size: 0.95rem;
}

.table-meta {
  margin: 4px 0 8px;
  color: #64748b;
  font-size: 0.8rem;
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
}

th {
  background: #f8fafc;
}
</style>
