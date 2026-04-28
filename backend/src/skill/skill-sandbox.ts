import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveSkillDirectory } from "../config.js";
import { assertPathInsideRoot } from "../path-manager.js";
import { loadSkills } from "./skill-loader.js";
import type { SkillScriptRunInput, SkillScriptRunResult } from "./skill-types.js";

/**
 * 解析脚本解释器，当前重点支持 Python 脚本。
 */
const resolveScriptCommand = (scriptPath: string): { command: string; commandArgs: string[] } => {
  const extension = path.extname(scriptPath).toLowerCase();

  if (extension === ".py") {
    return {
      command: process.env.PYTHON_BIN ?? "python",
      commandArgs: [scriptPath],
    };
  }

  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return {
      command: "node",
      commandArgs: [scriptPath],
    };
  }

  throw new Error(`不支持的脚本类型: ${extension}`);
};

/**
 * 确保脚本路径没有逃逸 skill 目录。
 */
const assertPathInsideSkill = (skillDirectory: string, scriptPath: string): string =>
  assertPathInsideRoot(skillDirectory, scriptPath, "脚本路径非法，超出 skill 目录");

/**
 * 在受限上下文中执行 skill 脚本。
 */
export const runSkillScript = async (input: SkillScriptRunInput): Promise<SkillScriptRunResult> => {
  const allSkills = await loadSkills(input.projectRoot);
  const selectedSkill = allSkills.find((skill) => skill.name === input.skillName);

  if (!selectedSkill) {
    throw new Error(`未找到 skill: ${input.skillName}`);
  }

  const absoluteScriptPath = assertPathInsideSkill(selectedSkill.directory, input.scriptPath);
  await fs.access(absoluteScriptPath);

  const { command, commandArgs } = resolveScriptCommand(absoluteScriptPath);

  const fullArgs = [...commandArgs, ...input.args];
  const child = spawn(command, fullArgs, {
    cwd: selectedSkill.directory,
    shell: false,
    env: {
      ...process.env,
      // PYTHONPATH 指向 skill 根目录，方便脚本中的相对包导入。
      PYTHONPATH: selectedSkill.directory,
    },
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
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`脚本执行超时: ${input.timeoutMs}ms`));
    }, input.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });

  return {
    exitCode,
    stdout,
    stderr,
    skillContextPreview: selectedSkill.skillMarkdown.slice(0, 1000),
    command,
    commandArgs: fullArgs,
  };
};

/**
 * 默认返回技能根目录，方便测试或其他模块复用。
 */
export const getSkillRootDirectory = (projectRoot: string) => resolveSkillDirectory(projectRoot);

