import type { ChatMessage } from "llamaindex";
import { OpenAI } from "@llamaindex/openai";
import type { SkillDefinition } from "../skill/skill-types.js";

/**
 * skill 调用决策结果。
 */
export interface SkillDecision {
  /** 是否调用 skill。 */
  shouldUseSkill: boolean;
  /** 需要调用的 skill 名称。 */
  skillName?: string;
  /** 需要执行的脚本路径。 */
  scriptPath?: string;
  /** 脚本参数。 */
  args?: string[];
  /** 决策原因说明。 */
  reason: string;
}

/**
 * 对 LLM 调用能力的抽象，便于真实模型与离线测试复用。
 */
export interface AgentLlm {
  /** 让模型判断是否需要调用 skill。 */
  judgeSkill(input: {
    userMessage: string;
    skills: SkillDefinition[];
  }): Promise<SkillDecision>;
  /** 按上下文生成最终回答（流式）。 */
  streamAnswer(input: {
    messages: ChatMessage[];
  }): Promise<AsyncIterable<string>>;
}

/**
 * 离线测试专用假 LLM。
 */
export class FakeAgentLlm implements AgentLlm {
  async judgeSkill(input: { userMessage: string; skills: SkillDefinition[] }): Promise<SkillDecision> {
    const normalizedMessage = input.userMessage.toLowerCase();

    if (normalizedMessage.includes("pdf")) {
      return {
        shouldUseSkill: true,
        skillName: "pdf",
        scriptPath: "scripts/extract_form_structure.py",
        args: ["{FILE_PDF}", "{OUTPUT_JSON}"],
        reason: "消息中明确提到 pdf，优先调用 pdf skill",
      };
    }

    if (normalizedMessage.includes("docx") || normalizedMessage.includes("word")) {
      return {
        shouldUseSkill: true,
        skillName: "docx",
        scriptPath: "scripts/office/unpack.py",
        args: ["{FILE_DOCX}", "{OUTPUT_DIR}", "--merge-runs", "false", "--simplify-redlines", "false"],
        reason: "消息中明确提到 docx/word，优先调用 docx skill",
      };
    }

    return {
      shouldUseSkill: false,
      reason: `根据当前规则无需调用 skill（可用 skills: ${input.skills.map((skill) => skill.name).join(", ")}）`,
    };
  }

  async streamAnswer(input: { messages: ChatMessage[] }): Promise<AsyncIterable<string>> {
    const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user");
    const answer = `FakeLLM(session): 已处理请求 -> ${typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""}`;

    return (async function* () {
      const parts = answer.match(/.{1,20}/g) ?? [];
      for (const part of parts) {
        yield part;
      }
    })();
  }
}

/**
 * 基于 LlamaIndex OpenAI 封装的真实 LLM。
 */
export class LlamaIndexAgentLlm implements AgentLlm {
  /** LlamaIndex OpenAI 客户端。 */
  private readonly llm: OpenAI;

  constructor(config: { apiKey: string; baseURL?: string; model: string }) {
    this.llm = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      temperature: 0.2,
    });
  }

  async judgeSkill(input: { userMessage: string; skills: SkillDefinition[] }): Promise<SkillDecision> {
    const judgePrompt = [
      "你是 skill 路由器，请仅输出 JSON。",
      "可选 skills（name + description）：",
      ...input.skills.map((skill) => `- ${skill.name}: ${skill.description}`),
      "输出格式: {\"shouldUseSkill\":boolean,\"skillName\":string|null,\"scriptPath\":string|null,\"args\":string[],\"reason\":string}",
      "如果不确定，不要调用 skill。",
      `用户请求: ${input.userMessage}`,
    ].join("\n");

    const response = await this.llm.chat({
      stream: false,
      messages: [{ role: "user", content: judgePrompt }],
    });

    const raw = typeof response.message.content === "string" ? response.message.content : "{}";

    try {
      const parsed = JSON.parse(raw) as SkillDecision;
      return {
        shouldUseSkill: Boolean(parsed.shouldUseSkill),
        skillName: parsed.skillName,
        scriptPath: parsed.scriptPath,
        args: Array.isArray(parsed.args) ? parsed.args : [],
        reason: parsed.reason ?? "模型已完成 skill 决策",
      };
    } catch {
      return {
        shouldUseSkill: false,
        reason: "模型 skill 决策解析失败，降级为不调用 skill",
      };
    }
  }

  async streamAnswer(input: { messages: ChatMessage[] }): Promise<AsyncIterable<string>> {
    const stream = await this.llm.chat({
      stream: true,
      messages: input.messages,
    });

    return (async function* () {
      for await (const chunk of stream) {
        yield chunk.delta;
      }
    })();
  }
}

