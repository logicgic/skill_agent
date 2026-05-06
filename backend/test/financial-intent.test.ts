import { describe, expect, test } from "vitest";
import { buildDocumentCatalog } from "../src/chat/document-router.js";
import { decideFinancialIntentByMessage, detectFinancialIntent } from "../src/chat/financial-intent.js";

/**
 * 财报意图识别测试。
 *
 * @remarks
 * 验证隐式语义识别和文档命中决策行为。
 */
const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";

describe("financial intent router", () => {
  test("detects balance sheet intent from implicit message", () => {
    const intent = detectFinancialIntent("分析贵州茅台半年报的资产负债表");
    expect(intent).toBe("balance_sheet_analysis");
  });

  test("matches a pdf document and returns investment-value decision", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const decision = decideFinancialIntentByMessage("分析贵州茅台半年报中的投资价值", catalog);
    expect(decision).not.toBeNull();
    expect(decision?.intent).toBe("investment_value_analysis");
    expect(decision?.matchedPdf.relativePath.toLowerCase().endsWith(".pdf")).toBe(true);
  });
});

