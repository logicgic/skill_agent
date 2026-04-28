import path from "node:path";
/**
 * 从用户消息中识别财报分析意图。
 * 规则：先识别投资价值，再识别资产负债表，最后是泛化数据提取。
 */
export const detectFinancialIntent = (userMessage) => {
    /** 统一小写字符串用于关键词匹配。 */
    const normalizedMessage = userMessage.toLowerCase();
    /** 分析动词用于避免把“普通读取文档”误判为财报分析请求。 */
    const hasAnalysisVerb = ["分析", "评估", "研判", "解读"].some((keyword) => normalizedMessage.includes(keyword));
    if (normalizedMessage.includes("投资价值")) {
        return "investment_value_analysis";
    }
    if (normalizedMessage.includes("资产负债表") || normalizedMessage.includes("资产质量") || normalizedMessage.includes("偿债")) {
        return "balance_sheet_analysis";
    }
    if (hasAnalysisVerb
        && (normalizedMessage.includes("财报") || normalizedMessage.includes("半年报") || normalizedMessage.includes("年报"))) {
        return "financial_data_extraction";
    }
    return null;
};
/**
 * 在文档目录中匹配财报 PDF，并组合出完整意图决策。
 */
export const decideFinancialIntentByMessage = (userMessage, catalog) => {
    /** 意图标签用于确认是否需要进入财报专用链路。 */
    const intent = detectFinancialIntent(userMessage);
    if (!intent) {
        return null;
    }
    /** 统一小写字符串用于文件名匹配。 */
    const normalizedMessage = userMessage.toLowerCase();
    /** 先按文件名精确命中，避免误用第一个 PDF。 */
    const matchedPdf = catalog.byType.pdf.find((document) => {
        const filename = `${document.baseName}${document.extension}`.toLowerCase();
        return normalizedMessage.includes(document.baseName.toLowerCase()) || normalizedMessage.includes(filename);
    }) ?? catalog.byType.pdf[0];
    if (!matchedPdf) {
        return null;
    }
    return {
        matchedPdf,
        intent,
    };
};
/**
 * 生成财报提取与分析的默认中间产物路径。
 */
export const buildFinancialOutputPaths = (projectRoot, matchedPdf) => {
    /** 用文件名作为中间产物基名，方便追踪来源文档。 */
    const normalizedBaseName = matchedPdf.baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_");
    /** 提取结果输出目录。 */
    const extractJsonPath = path.join(projectRoot, "files", "parsed", "financial", `${normalizedBaseName}.extract.json`);
    /** 分析结果输出目录。 */
    const analysisJsonPath = path.join(projectRoot, "files", "parsed", "financial", `${normalizedBaseName}.analysis.json`);
    return {
        extractJsonPath,
        analysisJsonPath,
    };
};
