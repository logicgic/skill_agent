# 专用 PDF 数据提取 Skill 可行性方案

## Summary

问题：是否可以添加一个“专门从 PDF 中提取数据”的 skill？

结论：**可以，且建议添加**。  
原因：当前 `pdf` skill 主要做“表单结构/坐标提取”，不足以支撑财报分析所需的“结构化数值数据”。

本方案目标是新增一个“PDF 财报数据提取 skill”，并与后续“财报分析 skill”形成两段式链路：

1. `pdf_financial_extract`：提取并结构化财报表格数据。
2. `financial_statement_analysis`：基于结构化数据做规则分析和风险识别。

## Current State Analysis

### 1) 现有 `pdf` skill 的能力边界

- 自动路由到 PDF 时执行：`scripts/extract_form_structure.py`。
- 输出核心是 `labels/lines/checkboxes/row_boundaries`。
- 适配场景偏“表单定位/填充”，不是“财务表格抽取”。

=> 直接用于财报分析，数据粒度不够。

### 2) 新增 skill 的架构可行性

- `skill-loader` 只要求目录结构规范与 `SKILL.md` frontmatter，新增 skill 成本低。
- `skill-sandbox` 已支持 Python 执行与路径安全控制。
- chat 流程可通过 LLM 路由新增 skill（无需先改底层框架）。

### 3) 当前会受影响的点

- `document-router` 目前把 PDF 一律自动路由到 `pdf` skill。
- 若要“遇到财报 PDF 优先提取财务数据”，需加路由策略（按关键词/文件名/用户意图分流）。

## Proposed Changes

说明：本阶段只给方案，不执行。

### A. 新增专用 skill（必须）

- 新目录：`backend/.agent/skills/pdf_financial_extract/`
- 新文件建议：
  - `SKILL.md`
  - `scripts/extract_financial_tables.py`
  - `scripts/schema.md`
  - `scripts/sample_output.json`

#### `SKILL.md` 建议

- `name: pdf_financial_extract`
- `description` 明确触发条件：
  - 用户要求“提取财报数据/资产负债表数值/导出科目金额”
  - 或要求“先抽取再分析”

### B. 输出协议（核心）

`extract_financial_tables.py` 输出统一 JSON：

- `document_meta`（文件名、页码范围、抽取时间）
- `tables`（原始表格网格）
- `normalized_balance_sheet`（标准化字段）
- `confidence`（字段级置信度）
- `warnings`（抽取异常、缺失字段、单位无法识别等）

字段示例（标准化后）：

- `cash_and_equivalents`
- `accounts_receivable`
- `inventory`
- `short_term_debt`
- `fixed_assets`
- `construction_in_progress`
- `goodwill`
- `long_term_receivables`
- `report_period`
- `unit`

### C. 路由策略（两种可选）

方案 1（推荐先做）：

- 不改 `document-router` 自动规则；
- 先由 LLM 路由在“提取财报数据”语义下触发 `pdf_financial_extract`；
- 风险较低、改动面小。

方案 2（第二阶段）：

- 在 `document-router` 增加“财报语义关键词分流”；
- 对 PDF 匹配到“财报/资产负债表/科目/提取数据”时，优先路由到 `pdf_financial_extract`；
- 非财报 PDF 仍走现有 `pdf` skill。

### D. 与财报分析 skill 的衔接（建议同时规划）

- 约定输入输出路径：
  - 提取结果落地到 `files/parsed/financial/<name>.json`
- `financial_statement_analysis` 读取该 JSON 进行分析；
- 形成“extract -> analyze”的稳定流水线。

### E. 测试计划（必须）

- 新增测试建议：
  - `test/pdf-financial-extract.skill.test.ts`
  - `test/pdf-financial-extract.integration.test.ts`
- 覆盖点：
  - skill 加载成功
  - 脚本执行成功并输出规范 JSON
  - 失败输入（无表格、字段缺失）返回结构化错误
  - 与现有 `pdf/docx/xlsx` 路由回归不冲突

## Assumptions & Decisions

- 决策 1：允许新增独立 skill，而不是硬改现有 `pdf` skill。
- 决策 2：先实现“提取能力”再实现“分析能力”，分层解耦。
- 假设 1：财报 PDF 主要是可解析文本型（非纯扫描件）。
- 假设 2：对扫描件后续可补 OCR 路径，不纳入 v1 强制范围。

## 风险评估

1. 版式差异导致表格识别失败（高）
   - 需要字段置信度 + 警告输出 + 人工兜底。
2. 单位口径不一致（高）
   - 必须输出 `unit` 和 `report_period`，并在分析前做归一化。
3. 路由误触发（中）
   - 先走 LLM 触发，后续再做自动分流。

## Verification Steps

执行阶段验收步骤：

1. 新 skill 被 `loadSkills` 识别。
2. 给定财报 PDF，输出 JSON 包含 `normalized_balance_sheet`。
3. 请求“提取财报资产负债表数据”，可触发该 skill 并返回可用结果。
4. 失败场景有结构化错误，服务不崩溃。
5. 现有文档类 skill 与自动路由保持可用。

