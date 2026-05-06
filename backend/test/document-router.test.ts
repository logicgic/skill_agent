import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildAutoSkillPlanByDocument,
  buildDocumentCatalog,
  decideAutoSkillByDocument,
  type DocumentCatalog,
} from "../src/chat/document-router.js";

const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";

describe("document router", () => {
  test("builds categorized document catalog from files directory", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const pdfFile = catalog.documents.find((document) => document.extension === ".pdf");
    const docxFile = catalog.documents.find((document) => document.extension === ".docx");

    expect(catalog.byType.pdf.length).toBeGreaterThan(0);
    expect(catalog.byType.docx.length).toBeGreaterThan(0);
    expect(pdfFile?.relativePath).toContain("files");
    expect(docxFile?.relativePath).toContain("files");
  });

  test("auto routes to pdf content extraction skill when user mentions file name without typing pdf", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const decision = decideAutoSkillByDocument({
      userMessage: "请读取贵州茅台半年报并总结",
      catalog,
      projectRoot,
    });

    expect(decision).not.toBeNull();
    expect(decision?.skillName).toBe("pdf_content_extract");
    expect(decision?.scriptPath).toBe("scripts/extract_pdf_content.py");
    expect(decision?.args[0]).toContain(path.join(projectRoot, "files"));
    expect(decision?.args[0]).toContain("贵州");
    expect(decision?.args[0].toLowerCase().endsWith(".pdf")).toBe(true);
  });

  test("auto routes to xlsx skill when xlsx document is matched", () => {
    const catalog: DocumentCatalog = {
      documents: [
        {
          absolutePath: path.join(projectRoot, "files", "xlsx-files", "财务模型.xlsx"),
          relativePath: "files/xlsx-files/财务模型.xlsx",
          baseName: "财务模型",
          extension: ".xlsx",
          type: "xlsx",
        },
      ],
      byType: {
        pdf: [],
        docx: [],
        xlsx: [
          {
            absolutePath: path.join(projectRoot, "files", "xlsx-files", "财务模型.xlsx"),
            relativePath: "files/xlsx-files/财务模型.xlsx",
            baseName: "财务模型",
            extension: ".xlsx",
            type: "xlsx",
          },
        ],
      },
    };

    const decision = decideAutoSkillByDocument({
      userMessage: "请处理财务模型并更新excel公式",
      catalog,
      projectRoot,
    });

    expect(decision).not.toBeNull();
    expect(decision?.skillName).toBe("xlsx");
    expect(decision?.scriptPath).toBe("scripts/recalc.py");
    expect(decision?.args[0].toLowerCase().endsWith(".xlsx")).toBe(true);
  });

  test("returns null when no document can be matched", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const decision = decideAutoSkillByDocument({
      userMessage: "请帮我写一段自我介绍，不读取任何文件",
      catalog,
      projectRoot,
    });
    expect(decision).toBeNull();
  });

  test("builds multi-step auto plan for financial pdf analysis", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const planDecision = buildAutoSkillPlanByDocument({
      userMessage: "分析贵州茅台半年报的资产负债表",
      catalog,
      projectRoot,
    });

    expect(planDecision).not.toBeNull();
    expect(planDecision?.plan.steps.length).toBeGreaterThanOrEqual(2);
    expect(planDecision?.plan.steps[0]?.skillName).toBe("pdf_content_extract");
    expect(planDecision?.plan.steps[1]?.scriptPath).toBe("scripts/analyze_balance_sheet_from_extract.py");
  });
});
