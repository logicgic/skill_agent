import { promises as fs } from "node:fs";
import path from "node:path";
import { buildFinancialOutputPaths, detectFinancialIntent } from "./financial-intent.js";
import type { SkillPlan } from "./skill-plan.js";

/**
 * 支持自动路由的文档类型。
 *
 * @remarks
 * 自动路由仅覆盖结构化办公文档与 PDF。
 */
export type SupportedDocumentType = "pdf" | "docx" | "xlsx";

/**
 * `files` 目录中的单个文档项。
 *
 * @remarks
 * 结构体同时包含绝对路径与相对路径，便于执行和日志展示。
 */
export interface DocumentEntry {
  /** 文档绝对路径。 */
  absolutePath: string;
  /** 相对 projectRoot 的路径。 */
  relativePath: string;
  /** 不带扩展名的文件名。 */
  baseName: string;
  /** 扩展名（小写，带点）。 */
  extension: string;
  /** 映射后的文档类型。 */
  type: SupportedDocumentType;
}

/**
 * `files` 文档目录分类结果。
 *
 * @remarks
 * `documents` 保留全量，`byType` 提供按类型快速索引。
 */
export interface DocumentCatalog {
  /** 全量可识别文档。 */
  documents: DocumentEntry[];
  /** 按文档类型分类。 */
  byType: Record<SupportedDocumentType, DocumentEntry[]>;
}

/**
 * 自动路由 skill 的决策结果。
 *
 * @remarks
 * 该结构用于单步调用场景，也可作为多步计划的第一步来源。
 */
export interface AutoSkillDecision {
  /** 选中的 skill 名称。 */
  skillName: string;
  /** 选中的脚本相对路径。 */
  scriptPath: string;
  /** 脚本参数。 */
  args: string[];
  /** 决策说明。 */
  reason: string;
  /** 被匹配到的文档。 */
  matchedDocument: DocumentEntry;
}

/**
 * 自动路由生成的多步计划结果。
 *
 * @remarks
 * 包含执行计划与命中文档，便于后续展示和调试。
 */
export interface AutoSkillPlanDecision {
  /** 自动路由生成的计划。 */
  plan: SkillPlan;
  /** 第一步匹配到的文档。 */
  matchedDocument: DocumentEntry;
}

/**
 * 递归扫描目录下全部文件路径。
 *
 * @param directory 待扫描目录绝对路径。
 * @returns 扫描到的文件绝对路径数组。
 */
const walkFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }
    files.push(absolutePath);
  }

  return files;
};

/**
 * 将扩展名映射为支持的文档类型。
 *
 * @param extension 文件扩展名（小写、含点）。
 * @returns 支持的文档类型；未支持则返回 `null`。
 */
const toSupportedType = (extension: string): SupportedDocumentType | null => {
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".docx") {
    return "docx";
  }
  if (extension === ".xlsx") {
    return "xlsx";
  }
  return null;
};

/**
 * 统一文件名，避免输出文件名包含非法字符。
 *
 * @param baseName 原始文件名（不含扩展名）。
 * @returns 规范化后的文件名。
 */
const normalizeBaseName = (baseName: string): string =>
  baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_");

/**
 * 构建 `files` 目录分类索引。
 *
 * @param projectRoot 后端项目根目录绝对路径。
 * @returns 结构化文档目录索引。
 */
export const buildDocumentCatalog = async (projectRoot: string): Promise<DocumentCatalog> => {
  const filesDirectory = path.join(projectRoot, "files");
  const allFiles = await walkFiles(filesDirectory);

  const documents: DocumentEntry[] = [];
  for (const absolutePath of allFiles) {
    const extension = path.extname(absolutePath).toLowerCase();
    const type = toSupportedType(extension);
    if (!type) {
      continue;
    }

    documents.push({
      absolutePath,
      relativePath: path.relative(projectRoot, absolutePath).replaceAll("\\", "/"),
      baseName: path.parse(absolutePath).name,
      extension,
      type,
    });
  }

  documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    documents,
    byType: {
      pdf: documents.filter((document) => document.type === "pdf"),
      docx: documents.filter((document) => document.type === "docx"),
      xlsx: documents.filter((document) => document.type === "xlsx"),
    },
  };
};

/**
 * 依据用户消息匹配可能要读取的文件。
 *
 * @param userMessage 用户输入消息。
 * @param catalog 文档目录索引。
 * @returns 命中的文档；未命中返回 `null`。
 */
const matchDocumentByMessage = (userMessage: string, catalog: DocumentCatalog): DocumentEntry | null => {
  const normalizedMessage = userMessage.toLowerCase();

  const directMatch = catalog.documents.find((document) => {
    const fileNameWithExt = `${document.baseName}${document.extension}`.toLowerCase();
    return normalizedMessage.includes(document.baseName.toLowerCase()) || normalizedMessage.includes(fileNameWithExt);
  });
  if (directMatch) {
    return directMatch;
  }

  if (normalizedMessage.includes("pdf") && catalog.byType.pdf.length > 0) {
    return catalog.byType.pdf[0];
  }
  if ((normalizedMessage.includes("docx") || normalizedMessage.includes("word")) && catalog.byType.docx.length > 0) {
    return catalog.byType.docx[0];
  }
  if ((normalizedMessage.includes("xlsx") || normalizedMessage.includes("excel")) && catalog.byType.xlsx.length > 0) {
    return catalog.byType.xlsx[0];
  }

  return null;
};

/**
 * 根据消息和文档目录，自动生成 skill 调用决策。
 *
 * @param input 路由输入（用户消息、文档目录、项目路径）。
 * @returns 自动技能决策；未命中返回 `null`。
 * @remarks
 * 命中后由上层优先采用该决策（高于 LLM 路由）。
 */
export const decideAutoSkillByDocument = (input: {
  userMessage: string;
  catalog: DocumentCatalog;
  projectRoot: string;
}): AutoSkillDecision | null => {
  const matchedDocument = matchDocumentByMessage(input.userMessage, input.catalog);
  if (!matchedDocument) {
    return null;
  }

  const normalized = normalizeBaseName(matchedDocument.baseName);
  if (matchedDocument.type === "pdf") {
    return {
      skillName: "pdf_content_extract",
      scriptPath: "scripts/extract_pdf_content.py",
      args: [matchedDocument.absolutePath, path.join(input.projectRoot, "files", "parsed", "pdf", `${normalized}.json`)],
      reason: `识别到 PDF 文档：${matchedDocument.relativePath}，自动调用 pdf_content_extract skill`,
      matchedDocument,
    };
  }

  if (matchedDocument.type === "docx") {
    return {
      skillName: "docx",
      scriptPath: "scripts/office/unpack.py",
      args: [
        matchedDocument.absolutePath,
        path.join(input.projectRoot, "files", "parsed", "docx", normalized),
        "--merge-runs",
        "false",
        "--simplify-redlines",
        "false",
      ],
      reason: `识别到 DOCX 文档：${matchedDocument.relativePath}，自动调用 docx skill`,
      matchedDocument,
    };
  }

  return {
    skillName: "xlsx",
    scriptPath: "scripts/recalc.py",
    args: [matchedDocument.absolutePath],
    reason: `识别到 XLSX 文档：${matchedDocument.relativePath}，自动调用 xlsx skill`,
    matchedDocument,
  };
};

/**
 * 自动路由生成多步 skill 计划。
 *
 * @param input 路由输入（用户消息、文档目录、项目路径）。
 * @returns 自动生成的多步计划；未命中返回 `null`。
 */
export const buildAutoSkillPlanByDocument = (input: {
  userMessage: string;
  catalog: DocumentCatalog;
  projectRoot: string;
}): AutoSkillPlanDecision | null => {
  const single = decideAutoSkillByDocument(input);
  if (!single) {
    return null;
  }

  const steps: SkillPlan["steps"] = [
    {
      id: "step_1_auto_primary",
      skillName: single.skillName,
      scriptPath: single.scriptPath,
      args: single.args,
      reason: single.reason,
      required: true,
    },
  ];

  if (single.skillName === "pdf_content_extract") {
    const financialIntent = detectFinancialIntent(input.userMessage);
    if (financialIntent) {
      const outputPaths = buildFinancialOutputPaths(input.projectRoot, single.matchedDocument);
      steps.push({
        id: "step_2_pdf_balance_sheet_analyze",
        skillName: "pdf_content_extract",
        scriptPath: "scripts/analyze_balance_sheet_from_extract.py",
        args: [outputPaths.extractJsonPath, outputPaths.analysisJsonPath],
        reason: `识别到财报分析意图(${financialIntent})，自动追加资产负债分析步骤`,
        required: false,
      });
      steps.push({
        id: "step_3_balance_sheet_methodology",
        skillName: "balance_sheet_analysis",
        scriptPath: "",
        args: [],
        reason: "追加方法论分析步骤（无脚本执行）",
        required: false,
      });
    }
  }

  return {
    plan: {
      steps,
      triggerSource: "auto",
      planReason: `自动路由匹配文档 ${single.matchedDocument.relativePath}，生成 ${steps.length} 步计划`,
    },
    matchedDocument: single.matchedDocument,
  };
};

/**
 * 读取并格式化解析结果摘要，回填给模型使用。
 *
 * @param decision 自动路由技能决策。
 * @returns 解析摘要文本。
 * @throws 当目标解析产物不可读取或格式异常时抛出错误。
 */
export const buildParsedResultPreview = async (decision: AutoSkillDecision): Promise<string> => {
  if (decision.skillName === "pdf_content_extract") {
    const outputPath = decision.args[1];
    const raw = await fs.readFile(outputPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      pages?: unknown[];
      warnings?: unknown[];
    };
    return [
      `file=${decision.matchedDocument.relativePath}`,
      `pages=${parsed.pages?.length ?? 0}`,
      `warnings=${parsed.warnings?.length ?? 0}`,
    ].join("\n");
  }

  if (decision.skillName === "docx") {
    const outputDirectory = decision.args[1];
    const documentXmlPath = path.join(outputDirectory, "word", "document.xml");
    const rawXml = await fs.readFile(documentXmlPath, "utf-8");
    const plainText = rawXml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
    return [`file=${decision.matchedDocument.relativePath}`, `documentTextPreview=${plainText}`].join("\n");
  }

  return [`file=${decision.matchedDocument.relativePath}`, "xlsxParsed=true"].join("\n");
};

/**
 * 确保自动路由技能的输出目录存在。
 *
 * @param decision 自动路由技能决策。
 * @returns 无返回值；在必要时创建输出目录。
 */
export const ensureAutoSkillOutputPath = async (decision: AutoSkillDecision): Promise<void> => {
  if (decision.skillName === "pdf_content_extract") {
    await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
    return;
  }

  if (decision.skillName === "docx") {
    await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
  }
};
