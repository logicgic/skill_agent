import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSkills } from "../skill/skill-loader.js";
import { runSkillScript } from "../skill/skill-sandbox.js";
import { FakeAgentLlm, LlamaIndexAgentLlm } from "./llm-client.js";
import { buildAutoSkillPlanByDocument, buildDocumentCatalog, buildParsedResultPreview, decideAutoSkillByDocument, ensureAutoSkillOutputPath, } from "./document-router.js";
import { SessionStore } from "./session-store.js";
import { resolveScriptArgPlaceholders } from "../path-manager.js";
import { runSkillPlan } from "./skill-orchestrator.js";
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
        const documentCatalog = await buildDocumentCatalog(this.projectRoot);
        const previousHistory = this.sessionStore.getHistory(sessionId);
        const systemPrompt = this.buildSystemPrompt(skills, documentCatalog);
        yield { type: "meta", content: "已加载系统提示词、历史上下文和 skill 列表" };
        const llmSkillPlan = await this.llm.judgeSkillPlan({
            userMessage,
            skills,
        });
        const autoSkillDecision = decideAutoSkillByDocument({
            userMessage,
            catalog: documentCatalog,
            projectRoot: this.projectRoot,
        });
        const autoSkillPlanDecision = buildAutoSkillPlanByDocument({
            userMessage,
            catalog: documentCatalog,
            projectRoot: this.projectRoot,
        });
        let skillResultBlock = "";
        const finalSkillPlan = this.mergeSkillPlans(autoSkillPlanDecision?.plan ?? null, llmSkillPlan);
        if (finalSkillPlan && finalSkillPlan.steps.length > 0) {
            if (autoSkillDecision) {
                await ensureAutoSkillOutputPath(autoSkillDecision);
            }
            yield {
                type: "meta",
                content: `skillPlanSteps=${finalSkillPlan.steps.length} skillTriggerSource=${finalSkillPlan.triggerSource}`,
            };
            const stepMetaEvents = [];
            const planExecution = await runSkillPlan({
                projectRoot: this.projectRoot,
                catalog: documentCatalog,
                plan: finalSkillPlan,
                continueOnError: true,
                onStepEvent: (event) => {
                    if (event.type === "step_started") {
                        stepMetaEvents.push(`skillStepStarted=${event.step.id} stepIndex=${event.index}`);
                        return;
                    }
                    if (event.type === "step_completed") {
                        stepMetaEvents.push(`skillStepCompleted=${event.step.id} stepIndex=${event.index}`);
                        return;
                    }
                    if (event.type === "step_skipped") {
                        stepMetaEvents.push(`skillStepSkipped=${event.step.id} stepIndex=${event.index}`);
                        return;
                    }
                    stepMetaEvents.push(`skillStepFailed=${event.step.id} stepIndex=${event.index}`);
                },
            });
            for (const meta of stepMetaEvents) {
                yield { type: "meta", content: meta };
            }
            let parsedPreview = "";
            if (autoSkillDecision) {
                const firstResolved = planExecution.stepResults[0]?.resolvedArgs ?? autoSkillDecision.args;
                try {
                    parsedPreview = await buildParsedResultPreview({
                        ...autoSkillDecision,
                        args: firstResolved,
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`failureStage=parse\n${message}`);
                }
            }
            const stepBlocks = planExecution.stepResults.map((result, index) => [
                `[STEP:${index + 1}]`,
                `id=${result.step.id}`,
                `skill=${result.step.skillName}`,
                `script=${result.step.scriptPath || "none"}`,
                `status=${result.status}`,
                `exitCode=${result.exitCode}`,
                `reason=${result.step.reason}`,
                `resolvedArgs=${JSON.stringify(result.resolvedArgs)}`,
                `stdout=${result.stdout.slice(0, 3000)}`,
                `stderr=${result.stderr.slice(0, 1500)}`,
                `[/STEP:${index + 1}]`,
            ].join("\n"));
            skillResultBlock = [
                "[SKILL_PLAN]",
                `triggerSource=${finalSkillPlan.triggerSource}`,
                `planReason=${finalSkillPlan.planReason}`,
                ...stepBlocks,
                parsedPreview ? "[PARSED_DOCUMENT]" : "",
                parsedPreview,
                parsedPreview ? "[/PARSED_DOCUMENT]" : "",
                "[/SKILL_PLAN]",
            ]
                .filter(Boolean)
                .join("\n");
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
     * 合并自动路由与 LLM 计划，自动路由优先，LLM 计划补充去重步骤。
     */
    mergeSkillPlans(autoPlan, llmPlan) {
        if (!autoPlan && !llmPlan) {
            return null;
        }
        if (autoPlan && !llmPlan) {
            return autoPlan;
        }
        if (!autoPlan && llmPlan) {
            return llmPlan;
        }
        const merged = [...(autoPlan?.steps ?? [])];
        const existed = new Set(merged.map((step) => `${step.skillName}::${step.scriptPath}::${JSON.stringify(step.args)}`));
        for (const step of llmPlan?.steps ?? []) {
            const signature = `${step.skillName}::${step.scriptPath}::${JSON.stringify(step.args)}`;
            if (!existed.has(signature)) {
                merged.push(step);
                existed.add(signature);
            }
        }
        return {
            steps: merged,
            triggerSource: "hybrid",
            planReason: `auto+llm merged (${merged.length} steps)`,
        };
    }
    /**
     * 构建系统提示词：包含会话规范和可用 skills。
     */
    buildSystemPrompt(skills, documentCatalog) {
        const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
        const documentList = documentCatalog.documents.length > 0
            ? documentCatalog.documents.map((document) => `- ${document.relativePath} (${document.type})`).join("\n")
            : "- files 目录中暂无可识别文档";
        return [
            "你是一个 Skill Agent。",
            "必须先理解历史上下文，再判断是否调用 skill。",
            "如果识别到 files 目录文档，优先按文档类型自动调用 skill。",
            "如果用户要分析资产负债表，优先使用 balance_sheet_analysis skill 进行方法论分析。",
            "如果调用 skill，需要利用脚本执行结果和解析摘要进行回答。",
            "可用 skills: ",
            skillList,
            "files 文档清单: ",
            documentList,
        ].join("\n");
    }
    /**
     * 将占位符参数替换成测试数据路径。
     */
    resolveScriptArgs(args, catalog) {
        try {
            return resolveScriptArgPlaceholders(args, {
                projectRoot: this.projectRoot,
                catalog,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`failureStage=resolve\n${message}`);
        }
    }
    /**
     * 统一执行 skill，并把失败阶段归一化为 spawn/runtime。
     */
    async executeSkillWithFailureStage(input) {
        /** 执行结果用于拼接可观测日志与回答上下文。 */
        let execution;
        try {
            execution = await runSkillScript({
                projectRoot: this.projectRoot,
                skillName: input.skillName,
                scriptPath: input.scriptPath,
                args: input.args,
                timeoutMs: 120000,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`failureStage=spawn\n${message}`);
        }
        if (execution.exitCode !== 0) {
            const stderrSummary = execution.stderr.trim().slice(0, 500);
            const stdoutSummary = execution.stdout.trim().slice(0, 300);
            throw new Error([
                "failureStage=runtime",
                `Skill 执行失败: ${input.skillName}`,
                `exitCode=${execution.exitCode}`,
                `command=${execution.command} ${execution.commandArgs.join(" ")}`,
                stderrSummary ? `stderr=${stderrSummary}` : "",
                !stderrSummary && stdoutSummary ? `stdout=${stdoutSummary}` : "",
            ]
                .filter(Boolean)
                .join("\n"));
        }
        return execution;
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
