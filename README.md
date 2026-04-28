# Skill Agent 项目启动说明

本项目为前后端分离架构：
- 后端：`backend`（TypeScript + Fastify + LlamaIndex）
- 前端：`frontend`（Vue 3 + Vite）

## 1. 环境要求

- Node.js `>= 20`（建议 22）
- npm `>= 10`
- Python `>= 3.10`（用于执行 `.agent/skills` 下的 Python 脚本）

## 2. 安装依赖

在项目根目录打开终端后，分别安装前后端依赖：

```bash
cd backend
npm install

cd ../frontend
npm install
```

## 3. 配置环境变量

### 3.1 后端环境变量（`backend/.env`）

项目已提供模板：`backend/.env.example`。复制后改名为 `.env`：

```bash
cd backend
copy .env.example .env
```

说明：
- `OPENAI_API_KEY`：连接真实模型必填。
- `SKILL_AGENT_USE_FAKE_LLM=1`：可在无模型 Key 时跑通接口流程。

### 3.2 如何查找 Python 解释器路径（Windows）

后端会使用 `PYTHON_BIN` 执行 skill 脚本。可用以下方式查找解释器：

```bash
# 方式 1：查看 Python Launcher 管理的解释器
py -0p

# 方式 2：查看 PATH 中的 python
where python

# 方式 3：PowerShell 查询命令来源
Get-Command python
```

拿到路径后，写入 `backend/.env`：

```env
PYTHON_BIN=C:\Users\你的用户名\AppData\Local\Programs\Python\Python312\python.exe
```

如果 `python` 命令本身可用，也可以保持默认：

```env
PYTHON_BIN=python
```

#### 使用 Conda 环境时如何设置

推荐方式（最稳妥）是直接写 Conda 环境内 `python.exe` 的绝对路径：

```env
PYTHON_BIN=D:\anaconda\envs\你的环境名\python.exe
```

例如：

```env
PYTHON_BIN=D:\anaconda\envs\skill-agent\python.exe
```

也可以在启动后端前先激活 Conda 环境，然后继续使用默认值：

```bash
conda activate 你的环境名
```

```env
PYTHON_BIN=python
```

可用以下命令确认当前解释器路径：

```bash
where python
python -c "import sys; print(sys.executable)"
```

注意：`PYTHON_BIN` 需要是可执行文件路径或 `python`，不要写成 `conda run -n xxx python`。

### 3.3 前端环境变量（可选，`frontend/.env`）

项目已提供模板：`frontend/.env.example`。如需修改后端地址，复制后改名为 `.env`：

```bash
cd frontend
copy .env.example .env
```

未配置时默认是 `http://127.0.0.1:3001`（避免部分 Windows 环境下 `localhost` 解析到 IPv6 `::1` 导致连接失败）。

## 4. 启动项目

请先启动后端，再启动前端。

### 4.1 启动后端

```bash
cd backend
npm run dev
```

启动成功后默认输出：

```text
Skill agent backend is running on http://localhost:3001
```

### 4.2 启动前端

另开一个终端：

```bash
cd frontend
npm run dev
```

按终端提示访问 Vite 本地地址（通常是 `http://localhost:5173`）。

## 5. 目录说明（与启动相关）

- `backend/.agent/skills`：Skill 安装目录
- `backend/files`：测试文件目录（如 PDF、DOCX）

注意：后端请在 `backend` 目录下启动，保证 Skill 路径和文件路径解析正确。

## 6. 常用命令

### 后端

```bash
cd backend
npm run dev
npm run build
npm run start
npm run test
```

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

