# 前端响应显示与完整表格数据方案

## Summary

- 目标 1：修复“前端仍然大模型回答不显示”的问题。
- 目标 2：让前端表格展示“完整数据”，而非依赖模型自由生成的片段 Markdown。
- 结论：当前前端响应设计存在结构性问题；若要稳定实现“完整表格数据”，需要补充工具与数据通道。

## Current State Analysis

### A. 前端响应设计问题（已确认）

- 文件：`frontend/src/App.vue`
- 已发现问题：
  - 只处理 `chunk` 和 `meta` 事件，未处理 `error` 事件。
  - 后端返回 `type=error` 时，前端不会展示错误文本，用户体感是“回答不显示”。
  - SSE 解析逻辑较脆弱：`pending` 只在分隔符 `\n\n` 完整时消费，流结束后未对尾包做最终解析。
  - 解析函数存在重复拆分：外层先 `split('\n\n')`，内层 `parseSseEvents` 继续 split，易引入边界丢包。
  - 当前 UI 只有“消息文本渲染”通道，没有“结构化数据渲染”通道。

### B. 完整表格数据能力不足（已确认）

- 文件：`backend/.agent/skills/pdf_financial_extract/scripts/extract_financial_tables.py`
- 已发现问题：
  - 当前提取脚本仅抽取固定字段（如 `cash_and_equivalents`、`inventory` 等），不是“完整资产负债表逐行提取”。
  - 当前输出适合做指标分析，不足以支撑“前端完整表格展示”。
- 文件：`backend/src/chat/chat-service.ts`
- 已发现问题：
  - 仅通过文本上下文把提取/分析结果喂给大模型，没有单独把结构化表格数据以事件发送给前端。
  - 多处 `stdout.slice(...)` 截断上下文，进一步降低模型输出完整表格的概率。

### C. 是否需要补充工具（结论）

- 若仅修复“回答不显示”：不需要新增第三方工具，修改前端事件处理即可。
- 若要“表格完整数据稳定展示”：需要补充表格抽取能力（工具/库）并新增结构化事件协议，单靠模型 Markdown 不可靠。

## Proposed Changes

### 1) 前端：修复响应不显示（事件处理层）

- 文件：`frontend/src/App.vue`
- 改动内容：
  - 新增 `error` 事件分支：把错误内容写入 `meta` 系统消息区。
  - 新增 `done` 事件分支：显式标记一次回答结束，防止状态悬挂。
  - 重构 SSE 解析：统一在一个函数里处理 `pending` + 完整事件，流结束后补解析尾包。
  - 保留当前 Markdown 渲染链路，但把“显示失败”从静默变成可见错误。
- 价值：
  - 用户不会再看到“没输出但无提示”的黑盒状态。

### 2) 后端+前端：新增结构化表格数据通道（核心）

- 文件：`backend/src/types.ts`
- 改动内容：
  - 扩展流事件类型：新增如 `table_data`（或 `structured_table`）事件。
  - 定义表格 schema（列定义 + 行数据 + 数据来源 + 置信度/缺失说明）。

- 文件：`backend/src/chat/chat-service.ts`
- 改动内容：
  - 在财报链路中，除了 `chunk/meta`，额外推送结构化 `table_data` 事件给前端。
  - 保留大模型文本总结，但表格展示不再依赖模型自由发挥。

- 文件：`frontend/src/App.vue`（可拆分新组件）
- 新增模块建议：`frontend/src/components/StructuredTable.vue`
- 改动内容：
  - 接收 `table_data` 并渲染标准表格，支持横向滚动、空值占位、字段说明。
  - 与 Markdown 回答并行展示：上方结论文本、下方完整数据表。

### 3) 补充“完整表格提取”工具能力（必要）

- 文件：`backend/.agent/skills/pdf_financial_extract/scripts/extract_financial_tables.py`（或新增脚本）
- 改动方向（按优先级）：
  - 方案 A（推荐）：引入 `pdfplumber` 的表格抽取接口（`extract_tables`）+ 规则清洗，先支持资产负债表页的完整行列提取。
  - 方案 B：引入更强表格工具（如 Camelot/Tabula）处理复杂版式，作为增强路径。
- 结果目标：
  - 输出“完整行级表格 JSON”，而非仅固定字段。

### 4) 测试策略（不 mock，沿用现有结构）

- 前端测试：
  - `frontend/src/__tests__/App.spec.ts` 增加：
    - `error` 事件可见性用例；
    - `table_data` 结构化表格渲染用例；
    - 流结束尾包解析用例（防止最后一段丢失）。
- 后端测试：
  - `backend/test/chat.integration.test.ts` 增加：
    - 财报请求返回 `table_data` 事件用例；
    - `error` 事件与文本链路并存用例。
  - 新增 `backend/test/financial-table-extract.integration.test.ts`：
    - 使用真实 PDF，验证提取到完整行列而非仅固定字段。

## Assumptions & Decisions

- 已锁定决策：
  - 前端错误要“显示为系统消息”。
  - 表格完整数据采用“结构化直渲染”，不再依赖模型 Markdown 生成完整表格。
- 工具决策：
  - 需要补充工具能力来实现“完整表格数据”目标。
  - 第一阶段优先复用 `pdfplumber` 表格提取；若覆盖不足，再引入 Camelot/Tabula。

## Verification Steps

- 功能验证：
  - 触发无 API Key 或后端报错场景，前端必须显示 `error` 系统消息。
  - 请求资产负债表后，前端应稳定显示结构化完整表格（列头、行数据、缺失项提示）。
- 测试验证：
  - 前端单测通过（新增响应事件与表格渲染用例）。
  - 后端集成测试通过（新增 `table_data` 事件与真实 PDF 提取用例）。
- 回归验证：
  - 现有 Markdown 回答与代码块/列表渲染不回退；
  - SSE 流在尾包场景不丢内容。

