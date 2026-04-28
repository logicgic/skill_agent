import { promises as fs } from "node:fs";
import path from "node:path";
/**
 * 递归扫描目录下全部文件路径。
 */
const walkFiles = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];
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
const toSupportedType = (extension) => {
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
const normalizeBaseName = (baseName) => baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_");
/**
 * 构建 files 目录分类目录。
 */
export const buildDocumentCatalog = async (projectRoot) => {
    const filesDirectory = path.join(projectRoot, "files");
    const allFiles = await walkFiles(filesDirectory);
    const documents = [];
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
const matchDocumentByMessage = (userMessage, catalog) => {
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
export const decideAutoSkillByDocument = (input) => {
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
export const buildParsedResultPreview = async (decision) => {
    if (decision.skillName === "pdf") {
        const outputPath = decision.args[1];
        const raw = await fs.readFile(outputPath, "utf-8");
        const parsed = JSON.parse(raw);
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
export const ensureAutoSkillOutputPath = async (decision) => {
    if (decision.skillName === "pdf") {
        await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
        return;
    }
    if (decision.skillName === "docx") {
        await fs.mkdir(path.dirname(decision.args[1]), { recursive: true });
    }
};
