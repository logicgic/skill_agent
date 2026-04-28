import { spawn } from "node:child_process";
/**
 * 启动时检查 Python 解释器与关键依赖是否可用。
 */
export const runPythonDependencyHealthCheck = async () => {
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
    child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
    });
    const exitCode = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) {
        const reason = stderr.trim() || stdout.trim() || "未知错误";
        return `Python 依赖自检失败 command=${pythonCommand} reason=${reason}`;
    }
    return `Python 依赖自检通过 command=${pythonCommand} ${stdout.replace(/\s+/g, " ").trim()}`;
};
