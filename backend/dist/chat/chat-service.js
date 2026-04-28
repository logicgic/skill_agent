import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSkills } from "../skill/skill-loader";
import { runSkillScript } from "../skill/skill-sandbox";
import { FakeAgentLlm, LlamaIndexAgentLlm } from "./llm-client";
import { SessionStore } from "./session-store";
/**
 * 多轮会话 + skill 路由编排服务。
 */
export class ChatService {
    options;
    /** 会话历史存储器。 */
    sessionStore = new SessionStore();
    /** 模型客户端（真实或 fake）。 */
    llm;
    /** 项目根目录。 */
    projectRoot;
    constructor(options) {
        this.options = options;
        this.projectRoot = options.projectRoot;
        this.llm = options.useFakeLlm || !options.apiKey
            ? new FakeAgentLlm()
            : new LlamaIndexAgentLlm({
                apiKey: options.apiKey,
                baseURL: options.baseURL,
                model: options.model,
            });
    }
    /**
     * 处理一轮对话并产出流式事件。
     */
    async *chat(sessionId, userMessage) {
        const skills = await loadSkills(this.projectRoot);
        const previousHistory = this.sessionStore.getHistory(sessionId);
        const systemPrompt = this.buildSystemPrompt(skills);
        yield { type: "meta", content: "已加载系统提示词、历史上下文和 skill 列表" };
        const skillDecision = await this.llm.judgeSkill({
            userMessage,
            skills,
        });
        let skillResultBlock = "";
        if (skillDecision.shouldUseSkill && skillDecision.skillName && skillDecision.scriptPath) {
            yield { type: "meta", content: `已触发 skill: ${skillDecision.skillName}` };
            const scriptArgs = this.resolveScriptArgs(skillDecision.args ?? []);
            const execution = await runSkillScript({
                projectRoot: this.projectRoot,
                skillName: skillDecision.skillName,
                scriptPath: skillDecision.scriptPath,
                args: scriptArgs,
                timeoutMs: 120000,
            });
            skillResultBlock = [
                "[SKILL_EXECUTION]",
                `skill=${skillDecision.skillName}`,
                `script=${skillDecision.scriptPath}`,
                `exitCode=${execution.exitCode}`,
                `stdout=${execution.stdout.slice(0, 4000)}`,
                `stderr=${execution.stderr.slice(0, 2000)}`,
                "[/SKILL_EXECUTION]",
            ].join("\n");
        }
        const chatMessages = [
            { role: "system", content: systemPrompt },
            ...previousHistory.map((message) => ({ role: message.role, content: message.content })),
            {
                role: "user",
                content: [userMessage, skillResultBlock].filter(Boolean).join("\n\n"),
            },
        ];
        const stream = await this.llm.streamAnswer({ messages: chatMessages });
        let assistantContent = "";
        for await (const chunk of stream) {
            assistantContent += chunk;
            yield { type: "chunk", content: chunk };
        }
        const nextHistory = [
            ...previousHistory,
            { role: "user", content: userMessage },
            { role: "assistant", content: assistantContent },
        ];
        this.sessionStore.setHistory(sessionId, nextHistory);
        yield { type: "done", content: "completed" };
    }
    /**
     * 构建系统提示词：包含会话规范和可用 skills。
     */
    buildSystemPrompt(skills) {
        const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
        return [
            "你是一个 Skill Agent。",
            "必须先理解历史上下文，再判断是否调用 skill。",
            "如果调用 skill，需要利用脚本执行结果进行回答。",
            "可用 skills: ",
            skillList,
        ].join("\n");
    }
    /**
     * 将占位符参数替换成测试数据路径。
     */
    resolveScriptArgs(args) {
        const pdfPath = path.join(this.projectRoot, "files", "贵州茅台半年报.pdf");
        const docxPath = path.join(this.projectRoot, "files", "测试.docx");
        const outputJson = path.join(this.projectRoot, "files", "pdf-structure-output.json");
        const outputDir = path.join(this.projectRoot, "files", "docx-unpacked-output");
        return args.map((arg) => arg
            .replace("{FILE_PDF}", pdfPath)
            .replace("{FILE_DOCX}", docxPath)
            .replace("{OUTPUT_JSON}", outputJson)
            .replace("{OUTPUT_DIR}", outputDir));
    }
}
/**
 * 清理测试输出文件，避免目录堆积。
 */
export const cleanupGeneratedFiles = async (projectRoot) => {
    const generatedFiles = [
        path.join(projectRoot, "files", "pdf-structure-output.json"),
        path.join(projectRoot, "files", "docx-unpacked-output"),
    ];
    for (const generatedPath of generatedFiles) {
        await fs.rm(generatedPath, { force: true, recursive: true });
    }
};
