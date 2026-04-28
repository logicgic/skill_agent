# 多轮对话实现评估与优化计划

## Summary
- 目标：评估当前“系统提示词 -> 历史上下文与skills -> 判断是否调用skill -> 执行skill -> 流式输出”的多轮对话思路是否存在问题，并给出可落地优化方案。
- 结论：整体思路正确，主流程完整；但在“会话记忆持久性、skill执行结果可追溯性、路由鲁棒性、上下文窗口治理、错误恢复策略”上存在中高风险。
- 计划范围：仅产出评估与优化实施计划，不进行代码改动。

## Current State Analysis
- 当前实现入口在 `backend/src/chat/chat-service.ts`：
  - 每轮会加载 skills、读取 session 历史、构造 system prompt、做 skill 决策、可选执行脚本、再流式回答。
  - 符合你定义的单轮执行顺序，流程设计本身没有方向性错误。
- 会话存储在 `backend/src/chat/session-store.ts`：
  - 使用内存 `Map` 保存历史，仅进程级有效；重启后丢失。
  - 单机开发可用，但生产与长会话场景不可靠。
- skill 决策在 `backend/src/chat/llm-client.ts`：
  - 通过一次 JSON 输出让模型决定是否调用 skill，结构清晰。
  - 目前缺少严格结构校验与回退分支细化，存在解析失败和“错误调用/漏调用”风险。
- 集成测试在 `backend/test/chat.integration.test.ts`：
  - 验证了流式接口可用与基本会话连续性。
  - 但尚未覆盖“上下文过长截断、skill失败回退、多skill竞争路由、并发会话隔离”。

## Proposed Changes
- `backend/src/chat/session-store.ts`
  - What：从纯内存升级为“可插拔存储接口”（Memory/File/Redis），默认仍可用内存。
  - Why：解决重启丢历史，支持真实多轮会话与横向扩展。
  - How：定义 `SessionRepository` 接口；`SessionStore` 依赖注入仓储实现；增加 TTL 与最大历史条数策略。

- `backend/src/chat/chat-service.ts`
  - What：将 skill 决策与执行结果写入“可审计消息轨迹”，并纳入后续轮次历史。
  - Why：当前仅把 skill 结果拼进当轮 user 内容，后续轮无法稳定利用 tool 证据。
  - How：新增内部消息类型（如 `tool_decision`、`tool_result`）；入库时保留摘要与关键字段（skill/script/exitCode/hash）。

- `backend/src/chat/llm-client.ts`
  - What：强化 skill 路由输出的结构约束与容错。
  - Why：减少 JSON 解析失败、幻觉脚本路径、错误参数格式带来的执行风险。
  - How：对模型输出做 schema 校验（zod）；非法输出触发“安全降级：不调用skill+解释原因”；补充温度/提示模板控制。

- `backend/src/skill/skill-sandbox.ts`
  - What：补充沙箱资源与安全限制策略。
  - Why：目前主要是路径约束与超时，缺少 CPU/内存/文件访问白名单策略。
  - How：增加执行配额、输出截断策略、可访问目录白名单、失败分类错误码（timeout/import/runtime/security）。

- `backend/src/chat/chat-service.ts`（上下文治理）
  - What：引入上下文窗口管理（摘要 + 近期窗口）。
  - Why：多轮对话增长后 token 成本与模型失焦风险明显。
  - How：保留最近 N 轮原文，早期消息压缩为摘要；将 skill 结果保留“摘要+引用ID”，按需回查明细。

- 测试增强（`backend/test/*.test.ts`）
  - What：新增失败路径与边界测试。
  - Why：当前测试更偏“可用性”，不足以覆盖稳定性与安全性。
  - How：
    - 单元：路由 JSON 非法输出、脚本路径逃逸、超时中断、空历史/长历史。
    - 集成：skill 执行失败后是否可继续回答、并发 session 隔离、上下文截断后语义连续性。

## Assumptions & Decisions
- 决策：你提出的多轮实现思路“没有根本性问题”，属于可扩展的正确骨架。
- 决策：优先增强稳定性与可运维性，而非改变主流程顺序。
- 假设：短期仍以单后端服务部署；后续可按存储接口平滑迁移到 Redis 等外部存储。
- 假设：skill 仍遵循官方目录规范，`SKILL.md` 作为路由与执行前置上下文来源。

## Verification Steps
- 设计验证
  - 检查流程仍保持：系统提示词 -> 历史+skills -> skill决策 -> 可选执行 -> 流式输出。
  - 检查异常分支：skill 决策失败、脚本失败、流式中断均有可恢复路径。
- 测试验证
  - 单元测试：新增路由/沙箱/存储/上下文治理测试全部通过。
  - 集成测试：真实 docx/pdf skill 执行通过；失败场景可降级回答。
- 运行验证
  - 长会话压力下 token 与响应时延可控。
  - 服务重启后会话（若启用持久化仓储）可恢复。
