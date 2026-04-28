import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChatMessage } from "llamaindex";
import type { SkillDefinition } from "../skill/skill-types.js";
import { loadSkills } from "../skill/skill-loader.js";
import { runSkillScript } from "../skill/skill-sandbox.js";
import type { SessionMessage, StreamEvent } from "../types.js";
import { FakeAgentLlm, LlamaIndexAgentLlm, type AgentLlm } from "./llm-client.js";
import {
  buildDocumentCatalog,
  buildParsedResultPreview,
  decideAutoSkillByDocument,
  ensureAutoSkillOutputPath,
  type DocumentCatalog,
} from "./document-router.js";
import { SessionStore } from "./session-store.js";
import { resolveScriptArgPlaceholders } from "../path-manager.js";
import {
  buildFinancialOutputPaths,
  decideFinancialIntentByMessage,
  type FinancialIntent,
} from "./financial-intent.js";

/**
 * 聊天服务构造参数。
 */
export interface ChatServiceOptions {
  /** 项目根目录。 */
  projectRoot: string;
  /** 是否启用离线 fake LLM。 */
  useFakeLlm: boolean;
  /** 模型 API Key。 */
  apiKey?: string;
  /** 模型服务地址。 */
  baseURL?: string;
  /** 模型名。 */
  model: string;
}

/**
 * 多轮会话 + skill 路由编排服务。
 */
export class ChatService {
  /** 会话历史存储器。 */
  private readonly sessionStore = new SessionStore();
  /** 模型客户端（真实或 fake）。 */
  private readonly llm: AgentLlm;
  /** 项目根目录。 */
  private readonly projectRoot: string;
  /** 无小图标输出兜底：覆盖常见 emoji 与装饰符号范围。 */
  private readonly emojiRegex =
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

  constructor(private readonly options: ChatServiceOptions) {
    this.projectRoot = options.projectRoot;

    /**
     * 真实链路约束：
     * - 仅在显式测试模式 useFakeLlm=true 时允许 Fake LLM；
     * - 非测试模式必须提供 API Key，禁止无 key 时自动回退演示数据。
     */
    if (options.useFakeLlm) {
      this.llm = new FakeAgentLlm();
      return;
    }
    if (!options.apiKey) {
      throw new Error("未配置真实模型 API Key，已禁用 Fake 回退。请设置 OPENAI_API_KEY 或显式启用 SKILL_AGENT_USE_FAKE_LLM=1。");
    }
    this.llm = new LlamaIndexAgentLlm({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      model: options.model,
    });
  }

  /**
   * 处理一轮对话并产出流式事件。
   */
  async *chat(sessionId: string, userMessage: string): AsyncIterable<StreamEvent> {
    const skills = await loadSkills(this.projectRoot);
    const documentCatalog = await buildDocumentCatalog(this.projectRoot);
    const previousHistory = this.sessionStore.getHistory(sessionId);

    const systemPrompt = this.buildSystemPrompt(skills, documentCatalog);

    yield { type: "meta", content: this.sanitizeOutputText("已加载系统提示词、历史上下文和 skill 列表") };

    const skillDecision = await this.llm.judgeSkill({
      userMessage,
      skills,
    });
    const autoSkillDecision = decideAutoSkillByDocument({
      userMessage,
      catalog: documentCatalog,
      projectRoot: this.projectRoot,
    });
    /** 财报隐式意图决策，用于触发“提取 -> 分析”串联执行链路。 */
    const financialIntentDecision = decideFinancialIntentByMessage(userMessage, documentCatalog);

    let skillResultBlock = "";
    /** 投资价值场景的能力边界声明，避免超范围结论。 */
    let financialScopeDisclaimer = "";

    if (financialIntentDecision) {
      /** 财报意图标签，用于日志与测试断言。 */
      const financialIntent: FinancialIntent = financialIntentDecision.intent;
      /** 提取与分析输出文件路径。 */
      const outputPaths = buildFinancialOutputPaths(this.projectRoot, financialIntentDecision.matchedPdf);
      /** 表格提取范围：资产负债分析优先指定资产负债表，泛化提取走全量。 */
      const requestedTableScope = financialIntent === "financial_data_extraction" ? "ALL" : "资产负债表";
      await fs.mkdir(path.dirname(outputPaths.extractJsonPath), { recursive: true });

      yield {
        type: "meta",
        content: this.sanitizeOutputText(
          `financialIntent=${financialIntent} file=${financialIntentDecision.matchedPdf.relativePath}`,
        ),
      };

      /** 第一步：先从财报 PDF 提取结构化数据。 */
      const extractExecution = await this.executeSkillWithFailureStage({
        skillName: "pdf_financial_extract",
        scriptPath: "scripts/extract_financial_tables.py",
        args: [financialIntentDecision.matchedPdf.absolutePath, outputPaths.extractJsonPath, requestedTableScope],
      });
      /** 第二步：在提取结果基础上执行资产负债分析。 */
      const analysisExecution = await this.executeSkillWithFailureStage({
        skillName: "financial_statement_analysis",
        scriptPath: "scripts/analyze_balance_sheet.py",
        args: [outputPaths.extractJsonPath, outputPaths.analysisJsonPath],
      });
      yield {
        type: "meta",
        content: this.sanitizeOutputText("financialChain=pdf_financial_extract->financial_statement_analysis"),
      };

      const analysisRaw = await fs.readFile(outputPaths.analysisJsonPath, "utf-8");
      const analysisParsed = JSON.parse(analysisRaw) as {
        summary?: { overall_view?: string; top_signal?: string };
      };
      const extractRaw = await fs.readFile(outputPaths.extractJsonPath, "utf-8");
      const extractParsed = JSON.parse(extractRaw) as {
        table_sections?: {
          requested_scope?: string;
          selected_tables?: Array<{ title_guess?: string; quality?: { row_count?: number; column_count?: number } }>;
          all_tables?: Array<{ title_guess?: string; quality?: { row_count?: number; column_count?: number } }>;
          unmatched_request?: string | null;
        };
      };
      /** 表格提取摘要：用于前端可视化提示和模型上下文补强。 */
      const requestedScope = extractParsed.table_sections?.requested_scope ?? requestedTableScope;
      const selectedTables = extractParsed.table_sections?.selected_tables ?? [];
      const allTables = extractParsed.table_sections?.all_tables ?? [];
      const unmatchedRequest = extractParsed.table_sections?.unmatched_request ?? null;
      const selectedTitles = selectedTables.slice(0, 5).map((table) => table.title_guess ?? "未命名表格").join(" | ");
      const tableExtractionSummary = [
        `requestedScope=${requestedScope}`,
        `selectedTableCount=${selectedTables.length}`,
        `allTableCount=${allTables.length}`,
        `selectedTableTitles=${selectedTitles || "无"}`,
      ].join("\n");
      /**
       * 向前端发送结构化表格数据事件：
       * - 优先 selected_tables（命中用户指定范围）；
       * - 同时保留 all_tables（支持“提取全部表格”展示）。
       */
      yield {
        type: "table_data",
        content: JSON.stringify({
          requested_scope: requestedScope,
          selected_tables: selectedTables,
          all_tables: allTables,
          unmatched_request: unmatchedRequest,
        }),
      };
      yield { type: "meta", content: this.sanitizeOutputText(`tableExtractionSummary ${tableExtractionSummary.replace(/\n/g, " ")}`) };
      if (unmatchedRequest) {
        yield { type: "meta", content: this.sanitizeOutputText(unmatchedRequest) };
      }
      /** 分析摘要文本用于回注到最终回答上下文。 */
      const analysisSummary = [
        `overall=${analysisParsed.summary?.overall_view ?? "暂无分析概述"}`,
        `topSignal=${analysisParsed.summary?.top_signal ?? "暂无"}`,
      ].join("\n");

      if (financialIntent === "investment_value_analysis") {
        financialScopeDisclaimer = "当前结论基于资产负债表维度，不含利润表、现金流和估值模型。";
        yield { type: "meta", content: this.sanitizeOutputText(financialScopeDisclaimer) };
      }

      skillResultBlock = [
        "[SKILL_EXECUTION]",
        "skill=pdf_financial_extract",
        "script=scripts/extract_financial_tables.py",
        `exitCode=${extractExecution.exitCode}`,
        `stdout=${extractExecution.stdout.slice(0, 1500)}`,
        `stderr=${extractExecution.stderr.slice(0, 800)}`,
        "[/SKILL_EXECUTION]",
        "[SKILL_EXECUTION]",
        "skill=financial_statement_analysis",
        "script=scripts/analyze_balance_sheet.py",
        `exitCode=${analysisExecution.exitCode}`,
        `stdout=${analysisExecution.stdout.slice(0, 1500)}`,
        `stderr=${analysisExecution.stderr.slice(0, 800)}`,
        "[TABLE_EXTRACTION_SUMMARY]",
        tableExtractionSummary,
        unmatchedRequest ? `unmatchedRequest=${unmatchedRequest}` : "",
        "[/TABLE_EXTRACTION_SUMMARY]",
        "[FINANCIAL_ANALYSIS_SUMMARY]",
        analysisSummary,
        "[/FINANCIAL_ANALYSIS_SUMMARY]",
        "[/SKILL_EXECUTION]",
      ].join("\n");
    } else

    if (autoSkillDecision || (skillDecision.shouldUseSkill && skillDecision.skillName && skillDecision.scriptPath)) {
      // 触发契约：自动路由命中时优先，LLM 决策仅作后备。
      const triggerSource = autoSkillDecision ? "auto" : "llm";
      const selectedSkill = autoSkillDecision
        ? {
            shouldUseSkill: true,
            skillName: autoSkillDecision.skillName,
            scriptPath: autoSkillDecision.scriptPath,
            args: autoSkillDecision.args,
            reason: autoSkillDecision.reason,
          }
        : skillDecision;
      if (!selectedSkill.skillName || !selectedSkill.scriptPath) {
        throw new Error("failureStage=route\nskill 决策缺少必要字段");
      }

      if (autoSkillDecision) {
        yield { type: "meta", content: this.sanitizeOutputText(`已按文件类型自动路由 skill: ${selectedSkill.skillName}`) };
        await ensureAutoSkillOutputPath(autoSkillDecision);
      } else {
        yield { type: "meta", content: this.sanitizeOutputText(`已触发 skill: ${selectedSkill.skillName}`) };
      }

      const scriptArgs = this.resolveScriptArgs(selectedSkill.args ?? [], documentCatalog);
      yield {
        type: "meta",
        content: this.sanitizeOutputText(
          [
            "skillDecision:",
            `skillTriggerSource=${triggerSource}`,
            `skillName=${selectedSkill.skillName}`,
            `scriptPath=${selectedSkill.scriptPath}`,
            `resolvedArgs=${JSON.stringify(scriptArgs)}`,
          ].join(" "),
        ),
      };

      const execution = await this.executeSkillWithFailureStage({
        skillName: selectedSkill.skillName,
        scriptPath: selectedSkill.scriptPath,
        args: scriptArgs,
      });

      if (execution.exitCode !== 0) {
        const stderrSummary = execution.stderr.trim().slice(0, 500);
        const stdoutSummary = execution.stdout.trim().slice(0, 300);
        throw new Error(
          [
            "failureStage=runtime",
            `Skill 执行失败: ${selectedSkill.skillName}`,
            `exitCode=${execution.exitCode}`,
            `command=${execution.command} ${execution.commandArgs.join(" ")}`,
            stderrSummary ? `stderr=${stderrSummary}` : "",
            !stderrSummary && stdoutSummary ? `stdout=${stdoutSummary}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      yield {
        type: "meta",
        content: this.sanitizeOutputText(
          `skillExecutionConfirmed=true skillName=${selectedSkill.skillName} exitCode=${execution.exitCode}`,
        ),
      };

      let parsedPreview = "";
      if (autoSkillDecision) {
        try {
          parsedPreview = await buildParsedResultPreview({
            ...autoSkillDecision,
            args: scriptArgs,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`failureStage=parse\n${message}`);
        }
      }

      skillResultBlock = [
        "[SKILL_EXECUTION]",
        `skill=${selectedSkill.skillName}`,
        `script=${selectedSkill.scriptPath}`,
        `exitCode=${execution.exitCode}`,
        `reason=${selectedSkill.reason}`,
        `stdout=${execution.stdout.slice(0, 4000)}`,
        `stderr=${execution.stderr.slice(0, 2000)}`,
        parsedPreview ? "[PARSED_DOCUMENT]" : "",
        parsedPreview,
        parsedPreview ? "[/PARSED_DOCUMENT]" : "",
        "[/SKILL_EXECUTION]",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...previousHistory.map((message) => ({ role: message.role, content: message.content })),
      {
        role: "user",
        content: [userMessage, skillResultBlock, financialScopeDisclaimer].filter(Boolean).join("\n\n"),
      },
    ];

    const stream = await this.llm.streamAnswer({ messages: chatMessages });

    let assistantContent = "";
    for await (const chunk of stream) {
      const sanitizedChunk = this.sanitizeOutputText(chunk);
      assistantContent += sanitizedChunk;
      yield { type: "chunk", content: sanitizedChunk };
    }

    const nextHistory: SessionMessage[] = [
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
  private buildSystemPrompt(skills: SkillDefinition[], documentCatalog: DocumentCatalog): string {
    const skillList = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
    const documentList = documentCatalog.documents.length > 0
      ? documentCatalog.documents.map((document) => `- ${document.relativePath} (${document.type})`).join("\n")
      : "- files 目录中暂无可识别文档";

    return [
      "你是一个 Skill Agent。",
      "必须先理解历史上下文，再判断是否调用 skill。",
      "如果识别到 files 目录文档，优先按文档类型自动调用 skill。",
      "如果调用 skill，需要利用脚本执行结果和解析摘要进行回答。",
      "全链路文本输出禁止使用任何 emoji、小图标或装饰符号，仅使用纯文本表达。",
      "可用 skills: ",
      skillList,
      "files 文档清单: ",
      documentList,
    ].join("\n");
  }

  /**
   * 输出文本净化：剔除 emoji/小图标，同时保留原有文本换行与空白。
   * 适用范围：meta / chunk / error 文本的最终输出兜底。
   */
  private sanitizeOutputText(content: string): string {
    return content.replace(this.emojiRegex, "");
  }

  /**
   * 将占位符参数替换成测试数据路径。
   */
  private resolveScriptArgs(args: string[], catalog: DocumentCatalog): string[] {
    try {
      return resolveScriptArgPlaceholders(args, {
        projectRoot: this.projectRoot,
        catalog,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`failureStage=resolve\n${message}`);
    }
  }

  /**
   * 统一执行 skill，并把失败阶段归一化为 spawn/runtime。
   */
  private async executeSkillWithFailureStage(input: {
    /** 需要执行的 skill 名称。 */
    skillName: string;
    /** 需要执行的脚本路径。 */
    scriptPath: string;
    /** 脚本参数。 */
    args: string[];
  }) {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`failureStage=spawn\n${message}`);
    }
    if (execution.exitCode !== 0) {
      const stderrSummary = execution.stderr.trim().slice(0, 500);
      const stdoutSummary = execution.stdout.trim().slice(0, 300);
      throw new Error(
        [
          "failureStage=runtime",
          `Skill 执行失败: ${input.skillName}`,
          `exitCode=${execution.exitCode}`,
          `command=${execution.command} ${execution.commandArgs.join(" ")}`,
          stderrSummary ? `stderr=${stderrSummary}` : "",
          !stderrSummary && stdoutSummary ? `stdout=${stdoutSummary}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    return execution;
  }
}

/**
 * 清理测试输出文件，避免目录堆积。
 */
export const cleanupGeneratedFiles = async (projectRoot: string): Promise<void> => {
  const generatedFiles = [
    path.join(projectRoot, "files", "pdf-structure-output.json"),
    path.join(projectRoot, "files", "docx-unpacked-output"),
  ];

  for (const generatedPath of generatedFiles) {
    await fs.rm(generatedPath, { force: true, recursive: true });
  }
};
