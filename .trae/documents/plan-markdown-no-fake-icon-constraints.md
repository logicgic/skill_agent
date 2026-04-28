# 实施方案：Markdown 渲染修复 + 全链路无小图标 + 禁止假数据

## Summary

- 目标 1：修复前端 AI 回答的 Markdown 渲染，达到“完整渲染”（标题、列表、表格、代码块、引用、换行）。
- 目标 2：在系统提示词加入明确约束，并在输出链路做兜底，确保全链路文本不出现小图标/emoji。
- 目标 3：禁止在无真实模型配置时返回 Fake 演示回答，改为明确报错。
- 约束：新增/修改的功能与变量都补充注释；新增模块必须提供测试；测试遵循现有结构且不使用 mock。

## Current State Analysis

- 前端当前将 `assistant` 内容直接用文本渲染（`{{ message.content }}`），没有 Markdown 解析器，因此会出现 Markdown 语法未渲染问题。
  - 文件：`frontend/src/App.vue`
- 前端现有测试断言仍基于旧文案（如“Skill Agent 聊天页”），与当前页面实现不一致，存在回归风险。
  - 文件：`frontend/src/__tests__/App.spec.ts`
  - 文件：`frontend/e2e/vue.spec.ts`
- 后端系统提示词目前没有“禁止小图标/emoji”约束。
  - 文件：`backend/src/chat/chat-service.ts`
- 后端在 `useFakeLlm=false` 但缺少 `apiKey` 时，仍会回退到 `FakeAgentLlm`，会产生演示/假数据风格回答。
  - 文件：`backend/src/chat/chat-service.ts`
  - 文件：`backend/src/chat/llm-client.ts`
- 关于你补充的问题“是否能识别 `backend/files` 内容”：
  - 当前实现会递归扫描 `projectRoot/files` 并识别 `.pdf/.docx/.xlsx`，可识别该目录内容。
  - 文件：`backend/src/chat/document-router.ts`

## Proposed Changes

### 1) 前端：新增 Markdown 渲染模块（完整渲染）

- 新增依赖：
  - `frontend/package.json`
  - 增加 `markdown-it`（Markdown 解析）与 `dompurify`（输出净化，防止 XSS）
- 新增模块：
  - `frontend/src/components/MessageMarkdown.vue`
  - 功能：接收 AI 文本，输出安全 HTML（`v-html`），支持完整 Markdown 特性。
  - 注释要求：对解析配置、净化步骤、每个关键变量（如渲染器实例、渲染函数）写中文注释。
- 接入点修改：
  - `frontend/src/App.vue`
  - 仅 `assistant` 消息走 Markdown 组件；`user/meta` 保持纯文本渲染，避免误解析。
  - 补充样式：标题、列表、表格、代码块、引用等统一样式，解决“有文字未正确渲染”。

### 2) 后端：系统提示词与输出链路双重约束“无小图标”

- 系统提示词增强：
  - `backend/src/chat/chat-service.ts` 的 `buildSystemPrompt()`
  - 新增明确规则：回答、解释、结论、meta 文本中不得包含 emoji/小图标/装饰符号，统一纯文本输出。
- 输出兜底净化（强约束）：
  - 新增 `sanitizeOutputText()`（放在 `chat-service.ts` 内私有方法，或拆到 `backend/src/chat/output-sanitizer.ts`）
  - 对所有向前端发送的 `chunk/meta/error` 文本执行去 emoji 处理，保证即使模型不遵守提示词也不泄露小图标。
  - 注释要求：说明正则范围、为何要做双重约束、对哪些事件类型生效。

### 3) 后端：禁止假数据回退，改为明确报错

- 真实模型配置策略调整：
  - `backend/src/chat/chat-service.ts`
  - 当前逻辑：`useFakeLlm || !apiKey -> FakeAgentLlm`
  - 目标逻辑：仅当 `useFakeLlm=true` 时允许 Fake；否则必须有 `apiKey`，缺失时抛出可读错误（如“未配置真实模型 API Key，已禁用 Fake 回退”）。
- 错误传播：
  - 保持现有 SSE 错误结构（`type=error`），前端可直接展示明确错误，不再给“演示数据”。
- 注释要求：对“为何不再自动回退 Fake”写清楚，避免后续误改回去。

### 4) 测试补齐（不 mock，沿用现有结构）

- 前端单测：
  - 新增：`frontend/src/__tests__/MessageMarkdown.spec.ts`
  - 用真实 Markdown 文本验证标题/列表/表格/代码块被正确渲染，且不回显原始 Markdown 符号。
  - 不 mock 解析器，直接走真实组件渲染。
- 前端现有测试修正：
  - 修改：`frontend/src/__tests__/App.spec.ts`
  - 修改：`frontend/e2e/vue.spec.ts`
  - 适配当前 UI 文案与结构（避免旧断言导致误报）。
- 后端测试：
  - 新增：`backend/test/chat.no-fake-fallback.test.ts`（或并入 `chat.integration.test.ts`）
  - 验证 `useFakeLlm=false` 且无 `apiKey` 时返回结构化错误，且响应中不包含 `FakeLLM(session)`。
  - 新增/扩展：`backend/test/chat.integration.test.ts`
  - 增加“输出文本无 emoji”断言（覆盖 `chunk` 与 `meta`）。
  - 全程 `server.inject` + 真实流程，不 mock 核心依赖。

## Assumptions & Decisions

- 已确认决策：
  - Markdown 目标深度：完整渲染。
  - 图标约束范围：全链路文本（assistant/meta/系统相关输出）不出现小图标。
  - 无真实结果策略：明确报错，不返回演示数据。
- 关键实现决策：
  - 前端采用“解析 + 净化”双阶段渲染，兼顾显示效果与安全性。
  - 后端采用“提示词约束 + 输出兜底过滤”双保险。
  - Fake 模型仅允许显式测试模式启用，生产/联调默认不兜底回退。

## Verification Steps

- 前端验证：
  - 运行 `frontend` 单测，确认 Markdown 组件与 App 用例通过。
  - 运行 `frontend` E2E，确认页面输入与发送链路正常，渲染无回归。
  - 手工输入包含标题、表格、代码块的提问，核验 assistant 渲染效果。
- 后端验证：
  - 运行 `backend` 测试集，确认新增“禁用 Fake 回退”与“无 emoji 输出”用例通过。
  - 在 `useFakeLlm=false` 且无 `OPENAI_API_KEY` 环境下调用 `/api/chat/stream`，应返回明确错误。
  - 在正常配置下发起“资产负债表”请求，确认走真实链路且不出现演示文本。
- 回归检查：
  - 验证文档自动识别仍能读取 `backend/files` 下内容（`buildDocumentCatalog` 行为不变）。
  - 验证新增注释覆盖新增模块、关键变量和主要逻辑分支。

