import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 支持自动路由的文档类型。
 */
export type SupportedDocumentType = "pdf" | "docx" | "xlsx";

/**
 * files 目录中的单个文档项。
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
 * files 文档目录分类结果。
 */
export interface DocumentCatalog {
  /** 全量可识别文档。 */
  documents: DocumentEntry[];
  /** 按文档类型分类。 */
  byType: Record<SupportedDocumentType, DocumentEntry[]>;
}

/**
 * 自动路由 skill 的决策结果。
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
 * 递归扫描目录下全部文件路径。
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
 */
const normalizeBaseName = (baseName: string): string =>
  baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_");

/**
 * 构建 files 目录分类目录。
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
      skillName: "pdf",
      scriptPath: "scripts/extract_form_structure.py",
      args: [matchedDocument.absolutePath, path.join(input.projectRoot, "files", "parsed", "pdf", `${normalized}.json`)],
      reason: `识别到 PDF 文档：${matchedDocument.relativePath}，自动调用 pdf skill`,
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
 * 读取并格式化解析结果摘要，回填给模型使用。
 */
export const buildParsedResultPreview = async (decision: AutoSkillDecision): Promise<string> => {
  if (decision.skillName === "pdf") {
    const outputPath = decision.args[1];
    const raw = await fs.readFile(outputPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      pages?: unknown[];
      labels?: unknown[];
      lines?: unknown[];
      checkboxes?: unknown[];
      row_boundaries?: unknown[];
    };
    return [
      `file=${decision.matchedDocument.relativePath}`,
      `pages=${parsed.pages?.length ?? 0}`,
      `labels=${parsed.labels?.length ?? 0}`,
      `lines=${parsed.lines?.length ?? 0}`,
      `checkboxes=${parsed.checkboxes?.length ?? 0}`,
      `rowBoundaries=${parsed.row_boundaries?.length ?? 0}`,
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
 */
export const ensureAutoSkillOutputPath = async (decision: AutoSkillDecision): Promise<void> => {
  if (decision.skillName === "pdf") {
    await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
    return;
  }

  if (decision.skillName === "docx") {
    await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
  }
};
