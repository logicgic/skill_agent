# Skill 执行链路审计与验收计划

## Summary

本计划用于系统性确认以下目标是否成立：

1. skill 触发机制符合预期，且行为可解释。
2. skill 确实被执行（而不是仅由模型“口头描述”）。
3. 执行结果真实回流到回答链路，系统整体生效。
4. 运行链路无明显 bug，且满足当前需求（多轮、自动路由、路径安全、SSE 流式）。

同时回答问题“当前 skill 的触发机制是怎么样的”：

- 入口在 `POST /api/chat/stream`，调用 `ChatService.chat()`。
- 每轮会先并行准备上下文：`loadSkills + buildDocumentCatalog + session history`。
- 触发决策有两路：
  - 自动路由：`decideAutoSkillByDocument(...)`（按用户消息与 `files` 文档名/类型匹配）。
  - LLM 路由：`llm.judgeSkill(...)`（模型 JSON 决策）。
- 优先级：若自动路由命中，则**优先使用自动路由**；否则使用 LLM 决策。
- 执行：`runSkillScript(...)` 真正 `spawn` 脚本进程；`exitCode != 0` 直接报错中断，不再交给 LLM猜测。
- 成功后将 `[SKILL_EXECUTION]`（含 `skill/script/exitCode/stdout/stderr`）与解析摘要注入最终模型回答上下文。

## Current State Analysis

基于代码现状（只读检查）：

- 触发主链路：`src/chat/chat-service.ts`
  - 已实现自动路由优先于 LLM 路由。
  - 已在 `exitCode != 0` 时抛结构化错误（含 command、stderr 摘要）。
  - 已接入占位符解析 `resolveScriptArgPlaceholders`，避免硬编码文件路径。
- 自动路由规则：`src/chat/document-router.ts`
  - 支持 `pdf/docx/xlsx`。
  - 按“文件名直匹配优先，关键字兜底（pdf/docx/word/xlsx/excel）”。
  - 为 pdf/docx 生成输出目录与解析摘要。
- 实际执行器：`src/skill/skill-sandbox.ts`
  - `.py` 使用 `PYTHON_BIN`（或 `python`）。
  - 脚本路径做目录越权防护（`assertPathInsideRoot`）。
  - 返回 `exitCode/stdout/stderr/command/commandArgs`。
- 启动与环境：`src/index.ts + src/skill/skill-health.ts`
  - 启动时固定加载 `backend/.env`。
  - 有 Python 依赖健康检查（pdfplumber/pypdf/openpyxl/defusedxml/lxml）。
- 测试现状：
  - 已有：路由测试、sandbox 真实脚本测试、chat integration 测试、多轮会话测试。
  - 缺口：缺少针对 xlsx 自动路由与失败链路的集成断言；缺少“自动路由与 LLM 冲突时优先级”显式测试；缺少 health check 的可测试契约。

## Proposed Changes

说明：本阶段为计划，不执行改动；以下为执行阶段将落地的改动方案。

### 1) 增强触发与执行可观测性（优先）

- 文件：`src/chat/chat-service.ts`
- 目标：让前端和测试可以直接看见“是否真实触发 + 触发来源 + 实际执行命令”。
- 方案：
  - 增加 meta 事件字段（或统一文本约定）：
    - `skillTriggerSource=auto|llm`
    - `skillName`
    - `scriptPath`
    - `resolvedArgs`（可脱敏）
  - 在成功执行后追加 `executionConfirmed=true` 标识。
  - 在失败时保留结构化错误并增加 `failureStage`（route/resolve/spawn/runtime/parse）。

### 2) 固化触发机制契约并防回归

- 文件：`src/chat/chat-service.ts`、`src/chat/document-router.ts`、`src/chat/llm-client.ts`
- 目标：防止后续改动破坏“自动路由优先”与“不确定不调用”的策略。
- 方案：
  - 在代码注释与测试中明确契约：
    - 自动路由命中时，忽略 LLM 决策结果。
    - 自动路由未命中时，才采用 LLM 决策。
    - 决策字段不完整时直接失败（不静默降级到错误回答）。

### 3) 补齐验收测试矩阵（核心）

- 文件：`test/chat.integration.test.ts`（扩展）
- 文件：`test/document-router.test.ts`（扩展）
- 文件：`test/skill-sandbox.test.ts`（扩展）
- 建议新增用例：
  - 自动路由命中 pdf/docx/xlsx 各 1 条。
  - 自动路由与 LLM 冲突场景，断言 auto 优先。
  - skill 脚本失败场景，断言 SSE 返回 `type:error` 且含 `exitCode/command`。
  - 无匹配文档且 LLM 不触发 skill 场景，断言不出现 `[SKILL_EXECUTION]`。
  - 多轮会话中前一轮 skill 输出能影响下一轮回答（保持当前行为）。

### 4) 健康检查结果接入验收流

- 文件：`src/skill/skill-health.ts`、`src/index.ts`、（可选）`src/server.ts`
- 目标：从“仅启动日志可见”升级为“可被自动验收读取”。
- 方案（两选一，执行时二选一）：
  - A：保留日志方式，仅在集成测试中通过启动日志匹配；
  - B：新增只读健康接口（如 `/api/health/skills`）返回解释器路径与缺失依赖列表。

### 5) 需求符合性对照检查

- 对照点：
  - 多轮会话：`SessionStore` 是否跨轮生效。
  - 自动文档识别：`files` 递归扫描与类型分组是否正确。
  - 安全约束：脚本路径越权阻断、cwd 与 PYTHONPATH 正确。
  - 流式输出：SSE 中 meta/chunk/error/done 顺序稳定。
  - 错误语义：失败时是否明确归因到系统错误而非模型臆断。

## Assumptions & Decisions

- 决策 1：保留“自动路由优先于 LLM 路由”的现有策略，不改业务语义。
- 决策 2：将“skill 是否真实执行”定义为：产生可验证执行证据（`exitCode + command + scriptPath`）。
- 决策 3：错误优先系统化输出，不再让 LLM解释系统错误。
- 假设 1：当前 `files` 下会持续使用分类型目录（如 `pdf-files/docx-files`）。
- 假设 2：当前以 Windows + Conda 环境为主，`PYTHON_BIN` 可配置。

## Verification Steps

执行阶段将按以下步骤验收：

1. 运行后端测试：`npm run test`（应全绿）。
2. 运行构建：`npm run build`（应通过）。
3. 手工端到端验证（3 轮）：
   - 轮 1：发送“读取贵州茅台半年报”，应出现 `auto` 路由 meta，且有 `skill=pdf` 执行块。
   - 轮 2：发送“继续总结上次内容”，应体现多轮上下文延续。
   - 轮 3：构造失败输入（不存在文件或错误参数），应返回结构化 `type:error`，含 `exitCode/command`。
4. 触发机制验证：
   - 文件名命中但不含“pdf/docx/xlsx”关键词，仍能自动路由；
   - 无文件命中时才进入 LLM 路由决策。
5. 需求对照打勾：
   - 触发正确、执行真实、回流有效、错误可解释、无关键回归。

