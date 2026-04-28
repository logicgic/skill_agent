# 前端 Markdown 结构与表格渲染修复方案

## Summary

- 目标：修复“AI 回答完成后结构未输出、表格渲染失败”的前端问题。
- 结论：问题根因在前端展示链路，不在后端返回链路。
- 方案：保留“无小图标”约束，但避免破坏 Markdown 结构；新增回归测试，确保标题/列表/表格长期可用。

## Current State Analysis

- 已定位到 `frontend/src/App.vue` 中的 `removeEmoji()`：
  - 当前实现：`text.replace(emojiRegex, '').replace(/\s{2,}/g, ' ').trim()`
  - 风险点：`\s` 包含换行符，会把 Markdown 依赖的多行结构压平，导致：
    - 标题、列表、代码块结构可能异常；
    - 表格语法（表头行、分隔行、数据行）被合并后无法解析成 `<table>`。
- 渲染组件 `frontend/src/components/MessageMarkdown.vue` 本身配置正常：
  - `markdown-it` 已启用；
  - `table` 样式已定义；
  - `v-html + DOMPurify` 处理链路可用。
- 现有单测 `frontend/src/__tests__/MessageMarkdown.spec.ts` 仅验证组件本体，不覆盖 `App.vue` 里的预处理逻辑，因此未拦截该回归。

## Proposed Changes

### 1) 修复 Markdown 结构被破坏的问题（核心）

- 文件：`frontend/src/App.vue`
- 改动点：
  - 调整 `removeEmoji()`，仅移除 emoji/图标字符，不再做 `\s{2,}` 压缩与 `trim()`。
  - 保证 AI 回答中的换行、空行、缩进原样保留，供 `markdown-it` 正常解析。
- 原因：
  - Markdown 对换行/空行是语义敏感格式，不能在渲染前做“全空白归一化”。

### 2) 细化“无图标”策略，避免误伤结构

- 文件：`frontend/src/App.vue`
- 改动点：
  - 将“去图标”职责限定为“字符级过滤”，不做文本重排。
  - 保持 `assistant/user/meta` 都可继续使用无图标策略，但不得改变行结构。
- 原因：
  - 继续满足产品约束（无小图标），同时不破坏 Markdown 语义。

### 3) 补充回归测试（按现有结构，不 mock）

- 文件：`frontend/src/__tests__/App.spec.ts`
- 新增/调整测试：
  - 增加一个面向 `App.vue` 的渲染用例：
    - 注入包含标题与表格的 assistant 文本（通过组件状态或可触达路径）；
    - 断言页面实际输出存在 `h1`/`table` 元素。
  - 校验“含 emoji 的 Markdown 文本”在去图标后仍保留多行结构（例如仍可渲染出表格）。
- 文件：`frontend/src/__tests__/MessageMarkdown.spec.ts`
- 可选增强：
  - 增加一条“去掉 emoji 后仍可渲染表格”的用例，和 `App` 层测试形成双保险。

### 4) 联调验证与回归检查

- 文件：`frontend/src/App.vue`、`frontend/src/components/MessageMarkdown.vue`
- 验证内容：
  - AI 回答结束后，标题、列表、代码块、表格均按预期显示；
  - 表格边框与排版样式正常；
  - 文本中 emoji 被清理，但结构不丢失。

## Assumptions & Decisions

- 决策：
  - 继续保留“无小图标”约束；
  - 禁止任何会改变换行结构的预处理（空白折叠、trim）作用于 Markdown 渲染前文本。
- 范围：
  - 本次只修复前端显示链路，不改后端协议与 SSE 事件结构。

## Verification Steps

- 单元测试：
  - 运行 `frontend` 单测，确认 `App` 与 `MessageMarkdown` 用例通过。
- 手工验证：
  - 发送包含标题+表格的请求，确认最终页面出现结构化渲染（`<h1>`、`<table>`）。
  - 发送包含 emoji 的 Markdown，确认 emoji 被去除但表格仍可渲染。
- 回归点：
  - 检查普通纯文本问答不受影响；
  - 检查代码块与引用块样式不回退。

