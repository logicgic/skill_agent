import { OpenAI } from "@llamaindex/openai";
/**
 * 离线测试专用假 LLM。
 */
export class FakeAgentLlm {
    async judgeSkill(input) {
        const normalizedMessage = input.userMessage.toLowerCase();
        if (normalizedMessage.includes("pdf")) {
            return {
                shouldUseSkill: true,
                skillName: "pdf_content_extract",
                scriptPath: "scripts/extract_pdf_content.py",
                args: ["{FILE_PDF}", "{OUTPUT_JSON}"],
                reason: "消息中明确提到 pdf，优先调用 pdf_content_extract skill",
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
    async judgeSkillPlan(input) {
        const single = await this.judgeSkill(input);
        if (!single.shouldUseSkill || !single.skillName || !single.scriptPath) {
            return null;
        }
        return {
            triggerSource: "llm",
            planReason: single.reason,
            steps: [
                {
                    id: "step_1_llm_primary",
                    skillName: single.skillName,
                    scriptPath: single.scriptPath,
                    args: single.args ?? [],
                    reason: single.reason,
                    required: true,
                },
            ],
        };
    }
    async streamAnswer(input) {
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
export class LlamaIndexAgentLlm {
    /** LlamaIndex OpenAI 客户端。 */
    llm;
    constructor(config) {
        this.llm = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            model: config.model,
            temperature: 0.2,
        });
    }
    async judgeSkill(input) {
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
            const parsed = JSON.parse(raw);
            return {
                shouldUseSkill: Boolean(parsed.shouldUseSkill),
                skillName: parsed.skillName,
                scriptPath: parsed.scriptPath,
                args: Array.isArray(parsed.args) ? parsed.args : [],
                reason: parsed.reason ?? "模型已完成 skill 决策",
            };
        }
        catch {
            return {
                shouldUseSkill: false,
                reason: "模型 skill 决策解析失败，降级为不调用 skill",
            };
        }
    }
    async judgeSkillPlan(input) {
        const planPrompt = [
            "你是 skill 路由器，请仅输出 JSON。",
            "可选 skills（name + description）：",
            ...input.skills.map((skill) => `- ${skill.name}: ${skill.description}`),
            "输出格式: {\"triggerSource\":\"llm\",\"planReason\":\"...\",\"steps\":[{\"id\":\"...\",\"skillName\":\"...\",\"scriptPath\":\"...\",\"args\":[],\"reason\":\"...\",\"required\":true}]}",
            "如果不需要调用 skill，输出 null。",
            "每个 step 必须包含 skillName/scriptPath/args/reason/required。",
            `用户请求: ${input.userMessage}`,
        ].join("\n");
        const response = await this.llm.chat({
            stream: false,
            messages: [{ role: "user", content: planPrompt }],
        });
        const raw = typeof response.message.content === "string" ? response.message.content.trim() : "null";
        if (raw === "null") {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
                return null;
            }
            return {
                triggerSource: "llm",
                planReason: parsed.planReason ?? "模型生成多步计划",
                steps: parsed.steps
                    .filter((step) => Boolean(step?.skillName && step?.scriptPath))
                    .map((step, index) => ({
                    id: step.id || `step_${index + 1}_llm`,
                    skillName: step.skillName,
                    scriptPath: step.scriptPath,
                    args: Array.isArray(step.args) ? step.args : [],
                    reason: step.reason ?? "模型生成步骤",
                    required: Boolean(step.required),
                })),
            };
        }
        catch {
            return null;
        }
    }
    async streamAnswer(input) {
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
