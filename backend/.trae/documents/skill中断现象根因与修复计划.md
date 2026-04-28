# Skill 中断现象根因与修复计划

## Summary
- 目标：解释“用户请求资产负债表分析时，回答停在‘请确认提取成功后再分析’”的根因，并给出可执行修复方案与实施计划（本阶段不改代码）。
- 成功标准：
  - 明确判定中断是否为后端执行中断、流式中断或对话策略中断。
  - 给出证据链（路由、脚本执行、结果回注、模型回答阶段）。
  - 给出可落地改造步骤、风险与验收标准。

## Current State Analysis
- 请求入口与流式：
  - `src/server.ts` 以 SSE 输出 `meta/chunk/done/error`，异常时会写 `error` 事件并结束流。
- 主编排链路：
  - `src/chat/chat-service.ts` 中先 `loadSkills`、`buildDocumentCatalog`，再并行得到 `skillDecision` 与 `autoSkillDecision`。
  - 自动路由优先于 LLM 决策（命中自动路由时覆盖 LLM 路由）。
  - 执行后把 `[SKILL_EXECUTION]` 与可选 `[PARSED_DOCUMENT]` 拼接进最终用户上下文，随后调用 `llm.streamAnswer`。
- 路由与技能现状：
  - `src/chat/document-router.ts` 对 PDF 固定路由到 `pdf_content_extract/scripts/extract_pdf_content.py`。
  - `buildParsedResultPreview` 对 PDF 仅回注 `pages` 与 `warnings` 统计，不包含“可直接用于资产负债表分析”的结构化财务字段。
- LLM 兜底：
  - `src/chat/llm-client.ts` 的 Fake LLM 仅做关键词路由；真实模型按系统提示与执行结果生成回复。
- 关键事实判定：
  - 该“中断”更像“对话策略中断”（模型选择先确认再继续），不是后端脚本执行中断。
  - 证据：当前链路只保证“PDF内容提取”，未强制“提取后必须立即输出资产负债表分析结论”。

## Proposed Changes
- **A. 判定增强（最低侵入）**
  - 文件：`src/chat/chat-service.ts`、`src/chat/document-router.ts`
  - 方案：在识别到“分析类请求 + PDF路由”时，追加“分析任务模式”标记与更强的回答约束提示（禁止要求用户二次确认，直接给出当前可得分析与不足项）。
  - 目的：不增加新 skill，先降低“确认句中断”概率。

- **B. 数据回注增强（推荐）**
  - 文件：`src/chat/document-router.ts`
  - 方案：扩展 `buildParsedResultPreview`，除 `pages/warnings` 外，加入：
    - 文本预览摘要（高信号段落截断）
    - 关键词命中统计（资产负债表相关科目出现次数）
    - 页面分布信息（便于模型定位财务章节）
  - 目的：提升模型“直接输出分析”的信息充分性。

- **C. 双阶段编排恢复（强保证）**
  - 文件：`src/chat/chat-service.ts`、`src/chat/document-router.ts`、`src/chat/financial-intent.ts`（可复用或重建）
  - 方案：将“提取”与“分析”拆为两步显式流水线（先提取结构化字段，再分析生成结论），并把分析结果作为主上下文注入。
  - 目的：从架构上避免“只提取未分析”的策略漂移。
  - 备注：若不恢复旧 skill，可在 `pdf_content_extract` 内新增“财务字段抽取模式”脚本，保持单 skill 但双脚本阶段。

- **D. 前端可观测性增强（辅助）**
  - 文件：`frontend/src/App.vue`
  - 方案：将 `meta` 事件中关键阶段（路由命中、脚本成功、分析阶段开始）显式展示，便于判断是“执行中断”还是“对话中断”。
  - 目的：减少误判和排障时间。

## Assumptions & Decisions
- 用户定义的“中断”是“回复停在确认句”，不是 SSE 中断或脚本报错。
- 本次优先产出“判断+方案+实施计划”，不直接改代码。
- 当前主要问题是“编排策略与提示约束不足”，而非脚本执行失败。
- 若要强保证“每次都给分析结论”，应采用 C 方案（双阶段显式编排）。

## Verification Steps
- 复现实验用例：
  - 输入：`分析贵州茅台的资产负债表的情况`
  - 期望：不出现“请确认后再分析”，而是直接输出分析结论（可附“数据不足项”）。
- 观测点：
  - SSE 事件序列必须包含 `meta(skillTriggerSource/skillName)`、`meta(skillExecutionConfirmed)`、`done`。
  - 无 `error` 事件。
- 验收断言（建议自动化）：
  - 集成测试断言响应体不含“请确认我已成功提取”。
  - 断言响应体包含分析类关键词（如“资产负债率/偿债能力/风险点”之一）。
- 回归范围：
  - PDF 普通读取场景仍可正常摘要。
  - DOCX/XLSX 自动路由行为不受影响。
