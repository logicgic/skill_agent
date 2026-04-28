# pdf_financial_extract 升级方案：脚本化表格提取

## Summary

- 目标：把现有 `pdf_financial_extract` 从“关键词字段提取”升级为“脚本化表格提取 skill”。
- 路线：优先采用 `pdfplumber` 表格 API（`extract_tables`）实现，不新增重型依赖。
- 输出：保留当前 `normalized_balance_sheet` 等字段，同时新增 `table_sections`，支持前端结构化渲染。
- 能力：支持两类场景
  - 用户指定某个表格（如资产负债表）时，输出该指定表格；
  - 同时具备提取 PDF 内全部可识别表格的能力。

## Current State Analysis

- 当前 skill 定义：
  - 文件：`backend/.agent/skills/pdf_financial_extract/SKILL.md`
  - 入口脚本：`scripts/extract_financial_tables.py`
- 当前脚本实现：
  - 文件：`backend/.agent/skills/pdf_financial_extract/scripts/extract_financial_tables.py`
  - 仅使用 `pdfplumber.extract_text()` + 正则抓取固定字段；
  - 未使用 `extract_table()/extract_tables()`，无法提供完整行列。
- 当前编排链路：
  - 文件：`backend/src/chat/chat-service.ts`
  - 财报链路固定调用 `extract_financial_tables.py` 后再调用 `analyze_balance_sheet.py`；
  - 目前只消费字段级 JSON，不消费完整表格结构。
- 当前事件与测试基线：
  - 类型定义：`backend/src/types.ts`
  - 集成测试：`backend/test/chat.integration.test.ts`

## Proposed Changes

### 1) 升级 skill 脚本为“完整表格提取 + 指定表格过滤”

- 文件：`backend/.agent/skills/pdf_financial_extract/scripts/extract_financial_tables.py`
- 改造内容：
  - 新增 `pdfplumber` 表格提取流程（逐页 `extract_tables`）。
  - 为每个表格生成结构化对象：
    - `page`、`table_index`、`title_guess`、`headers`、`rows`、`raw_matrix`、`quality`。
  - 新增“指定表格匹配”逻辑：
    - 根据用户意图关键词（如“资产负债表”“利润表”“现金流量表”）与表头文本匹配；
    - 输出 `selected_tables`（指定表格）+ `all_tables`（全量表格）。
  - 继续保留现有字段提取逻辑，保证兼容：
    - `normalized_balance_sheet`、`warnings` 等字段仍输出。
  - 新增统一输出字段：
    - `table_sections`（推荐作为前端直接消费入口），包含：
      - `requested_scope`（用户指定/全量）
      - `selected_tables`
      - `all_tables`
      - `unmatched_request`（指定但未命中时说明）

### 2) 更新 skill 文档协议

- 文件：`backend/.agent/skills/pdf_financial_extract/SKILL.md`
- 改造内容：
  - 更新 Purpose 与 Output，明确：
    - 支持完整表格提取；
    - 支持指定表格与全量表格双模式；
    - 兼容保留旧字段 + 新增 `table_sections`。

### 3) 后端编排与消费适配

- 文件：`backend/src/chat/chat-service.ts`
- 改造内容：
  - 在财报链路读取提取 JSON 时增加 `table_sections` 消费逻辑。
  - 在上下文块中新增结构化摘要（例如表格数量、命中表格标题、行列统计），避免只依赖 `stdout` 片段。
  - 保持原分析链路不变（`financial_statement_analysis` 继续用 `normalized_balance_sheet`）。
  - 若用户明确请求指定表格但未命中，输出可见 `meta` 提示，避免“无结果静默失败”。

### 4) （可选增强）事件层预留结构化表格通道

- 文件：`backend/src/types.ts`（若本轮纳入）
- 内容：
  - 预留 `table_data` 事件类型（后续前端可直接渲染结构化表格）。
- 说明：
  - 本轮可先不改前端协议，仅在后端输出 JSON 文件并注入摘要；
  - 若同时推进前端完整表格直渲染，再启用该事件。

### 5) 测试补充（不 mock，沿用现有结构）

- 新增测试文件：
  - `backend/test/pdf-financial-extract.table.test.ts`
- 用例设计：
  - 使用真实 PDF（`backend/files/pdf-files/贵州茅台半年报.pdf`）执行脚本；
  - 断言 `table_sections.all_tables.length > 0`；
  - 断言指定“资产负债表”时 `selected_tables` 命中；
  - 断言兼容字段 `normalized_balance_sheet` 仍存在。
- 扩展集成测试：
  - 文件：`backend/test/chat.integration.test.ts`
  - 新增断言：财报链路响应中出现“表格提取摘要/命中表格”元信息。

## Assumptions & Decisions

- 已确认决策：
  - 技术路线：`pdfplumber` 表格 API 优先。
  - 能力范围：既支持用户指定表格，也支持 PDF 全量表格提取。
  - 输出策略：保留旧字段并新增 `table_sections`（兼容升级）。
- 假设前提：
  - 当前运行环境已可执行 `pdfplumber`（现有脚本已依赖）。
  - 测试 PDF 中存在可识别表格（否则用例应验证“未识别提示”而非失败）。

## Verification Steps

- 脚本验证：
  - 运行提取脚本后检查输出 JSON：
    - `table_sections.all_tables` 非空；
    - 指定“资产负债表”请求可命中 `selected_tables`；
    - `normalized_balance_sheet` 仍存在。
- 集成验证：
  - 通过 `/api/chat/stream` 发起“提取资产负债表”请求；
  - 确认链路仍执行 `pdf_financial_extract -> financial_statement_analysis`；
  - 确认响应有表格提取命中信息。
- 回归验证：
  - 原财报分析指标与摘要流程不回退；
  - 未指定表格时仍能输出全量表格清单与摘要。

