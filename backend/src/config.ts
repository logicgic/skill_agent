import path from "node:path";
import { z } from "zod";

/**
 * 后端运行时配置模型。
 *
 * @remarks
 * 使用 Zod 在进程启动阶段做配置收敛，避免运行时出现隐式配置错误。
 */
export const appConfigSchema = z.object({
  /** HTTP 服务监听端口。 */
  port: z.number().int().positive().default(3001),
  /** 后端项目根目录。 */
  projectRoot: z.string().min(1),
  /** OpenAI 兼容 API Key。 */
  openAIApiKey: z.string().optional(),
  /** OpenAI 兼容 Base URL，可接入代理或其他兼容模型服务。 */
  openAIBaseUrl: z.string().optional(),
  /** 模型名称。 */
  openAIModel: z.string().default("gpt-4.1-mini"),
  /** 是否启用假 LLM（用于离线测试）。 */
  useFakeLlm: z.boolean().default(false),
});

/**
 * 根据环境变量构建并校验配置对象。
 *
 * @param projectRoot 后端项目根目录绝对路径。
 * @returns 通过 `appConfigSchema` 校验后的配置对象。
 */
export const loadAppConfig = (projectRoot: string) =>
  appConfigSchema.parse({
    port: Number(process.env.PORT ?? 3001),
    projectRoot,
    openAIApiKey: process.env.OPENAI_API_KEY,
    openAIBaseUrl: process.env.OPENAI_BASE_URL,
    openAIModel: process.env.OPENAI_MODEL,
    useFakeLlm: process.env.SKILL_AGENT_USE_FAKE_LLM === "1",
  });

/**
 * 返回官方 skill 安装目录绝对路径。
 *
 * @param projectRoot 后端项目根目录绝对路径。
 * @returns `.agent/skills` 的绝对路径。
 */
export const resolveSkillDirectory = (projectRoot: string) =>
  path.join(projectRoot, ".agent", "skills");
