import { spawn } from "node:child_process";

/**
 * 启动时检查 Python 解释器与关键依赖是否可用。
 *
 * @returns 适合日志展示的健康检查结果文本。
 * @remarks
 * 该检查不会抛错中断启动，而是返回可观测诊断信息供上层打印。
 */
export const runPythonDependencyHealthCheck = async (): Promise<string> => {
  const pythonCommand = process.env.PYTHON_BIN ?? "python";
  const probeCode = [
    "import importlib.util",
    "import sys",
    "modules = ['pdfplumber', 'pypdf', 'openpyxl', 'defusedxml', 'lxml']",
    "status = {m: bool(importlib.util.find_spec(m)) for m in modules}",
    "missing = [m for m, ok in status.items() if not ok]",
    "print('python=' + sys.executable)",
    "print('missing=' + (','.join(missing) if missing else 'none'))",
  ].join(";");

  const child = spawn(pythonCommand, ["-c", probeCode], {
    shell: false,
    env: process.env,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    const reason = stderr.trim() || stdout.trim() || "未知错误";
    return `Python 依赖自检失败 command=${pythonCommand} reason=${reason}`;
  }

  return `Python 依赖自检通过 command=${pythonCommand} ${stdout.replace(/\s+/g, " ").trim()}`;
};
