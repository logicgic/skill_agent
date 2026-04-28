/**
 * 单个 Skill 的元信息。
 */
export interface SkillDefinition {
  /** Skill 名称（来自 SKILL.md frontmatter）。 */
  name: string;
  /** Skill 描述（来自 SKILL.md frontmatter）。 */
  description: string;
  /** Skill 文件夹绝对路径。 */
  directory: string;
  /** 原始 SKILL.md 完整文本。 */
  skillMarkdown: string;
}

/**
 * Skill 脚本执行输入参数。
 */
export interface SkillScriptRunInput {
  /** 项目根目录。 */
  projectRoot: string;
  /** 要执行的 skill 名称。 */
  skillName: string;
  /** 脚本相对路径（相对 skill 根目录）。 */
  scriptPath: string;
  /** 脚本参数列表。 */
  args: string[];
  /** 超时时间（毫秒）。 */
  timeoutMs: number;
}

/**
 * Skill 脚本执行结果。
 */
export interface SkillScriptRunResult {
  /** 进程退出码。 */
  exitCode: number;
  /** 标准输出文本。 */
  stdout: string;
  /** 标准错误文本。 */
  stderr: string;
  /** 执行前读取到的 SKILL.md 前缀内容。 */
  skillContextPreview: string;
  /** 实际执行命令。 */
  command: string;
  /** 实际执行参数（含脚本路径与业务参数）。 */
  commandArgs: string[];
}
