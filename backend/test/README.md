# 测试模块说明

本文档说明 `backend/test` 目录下测试的运行方式、依赖要求与编写约定。

## 1. 测试目标

当前项目测试分为以下三类：

- 单元/功能测试：验证路由、意图识别、路径管理等核心逻辑。
- 集成测试：通过接口调用验证聊天链路与流式响应行为。
- Skill 沙箱测试：真实执行 Python 脚本，验证 skill 加载与执行结果。

项目测试默认遵循真实依赖原则：

- 使用真实文件（如 `files/pdf-files/贵州茅台半年报.pdf`）。
- 使用真实 Python 运行环境执行脚本。
- 不使用 mock 替代核心依赖。

## 2. 目录结构

`backend/test` 目录中主要测试文件：

- `chat.integration.test.ts`：聊天接口集成测试。
- `document-router.test.ts`：文档路由匹配测试。
- `financial-intent.test.ts`：财报隐式意图识别测试。
- `path-manager.test.ts`：路径管理测试。
- `skill-loader.test.ts`：skill 加载测试。
- `skill-sandbox.test.ts`：skill 沙箱脚本执行测试。

辅助目录：

- `tmp/`：测试运行时生成的中间产物目录（如 JSON 输出、解包文件）。

## 3. 运行前准备

在 `backend` 目录下执行以下准备步骤：

1. 安装 Node.js 依赖：

```bash
npm install
```

2. 确认 Python 可执行：

- 系统中可通过 `python` 命令启动 Python。
- 若需指定 Python 路径，可设置环境变量 `PYTHON_BIN`。

3. 确认测试输入文件存在：

- `files/docx-files/测试.docx`
- `files/pdf-files/贵州茅台半年报.pdf`

## 4. 运行测试

在 `backend` 目录下：

1. 运行全部测试（CI 推荐）：

```bash
npm test
```

2. 监听模式运行（本地开发推荐）：

```bash
npm run test:watch
```

3. 运行单个测试文件（示例）：

```bash
npx vitest run test/skill-sandbox.test.ts
```

## 5. 常见问题排查

1. 报错“找不到模块（如 node:fs / node:path）”

- 原因：编辑器未正确加载测试目录的 TypeScript 配置。
- 处理：确认存在 `test/tsconfig.json`，并执行 VS Code 命令 `TypeScript: Restart TS Server`。

2. 报错 Python 启动失败

- 检查 `python` 命令是否可用。
- 检查 `PYTHON_BIN` 是否被设置为错误值。

3. 报错找不到 PDF/DOCX 文件

- 检查 `files` 目录是否完整。
- 检查测试运行目录是否为 `backend`。

## 6. 新增测试规范

新增测试时请遵循：

1. 保持测试简洁，只覆盖关键行为与回归风险点。
2. 不 mock 核心依赖，优先使用真实文件与真实执行链路。
3. 新增/修改的功能点，应同步补充对应测试用例。
4. 用例命名需表达行为意图，例如：
   - `chains financial extract and balance sheet analysis...`
   - `returns structured error when runtime execution fails`

## 7. 与构建的关系

- `npm run build` 仅编译 `src` 目录。
- 测试文件由 `vitest` 直接执行。
- `test/tsconfig.json` 仅用于测试目录的编辑器类型检查，不影响生产构建产物。
