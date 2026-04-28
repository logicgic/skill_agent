import { beforeAll, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runSkillScript } from "../src/skill/skill-sandbox";

const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";
const outputDir = path.join(projectRoot, "test", "tmp");

beforeAll(async () => {
  await fs.mkdir(outputDir, { recursive: true });
});

describe("skill sandbox", () => {
  test("executes docx unpack script in sandbox", async () => {
    const docxInput = path.join(projectRoot, "files", "docx-files", "测试.docx");
    const unpackedDir = path.join(outputDir, "docx-unpacked");

    const result = await runSkillScript({
      projectRoot,
      skillName: "docx",
      scriptPath: "scripts/office/unpack.py",
      args: [docxInput, unpackedDir, "--merge-runs", "false", "--simplify-redlines", "false"],
      timeoutMs: 120000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Unpacked");

    const documentXml = path.join(unpackedDir, "word", "document.xml");
    await expect(fs.access(documentXml)).resolves.toBeUndefined();
  });

  test("executes pdf structure extraction script in sandbox", async () => {
    const pdfInput = path.join(projectRoot, "files", "pdf-files", "贵州茅台半年报.pdf");
    const outputJson = path.join(outputDir, "pdf-structure.json");

    const result = await runSkillScript({
      projectRoot,
      skillName: "pdf",
      scriptPath: "scripts/extract_form_structure.py",
      args: [pdfInput, outputJson],
      timeoutMs: 120000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Saved to");

    const raw = await fs.readFile(outputJson, "utf-8");
    const parsed = JSON.parse(raw) as { pages: unknown[] };
    expect(parsed.pages.length).toBeGreaterThan(0);
  });

  test("rejects script path escaping skill directory", async () => {
    await expect(
      runSkillScript({
        projectRoot,
        skillName: "pdf",
        scriptPath: "../docx/scripts/comment.py",
        args: [],
        timeoutMs: 120000,
      }),
    ).rejects.toThrow("脚本路径非法");
  });

  test("executes financial extraction and balance-sheet analysis scripts in sequence", async () => {
    const pdfInput = path.join(projectRoot, "files", "pdf-files", "贵州茅台半年报.pdf");
    const extractedJson = path.join(outputDir, "financial-extract.json");
    const analyzedJson = path.join(outputDir, "financial-analysis.json");

    const extractResult = await runSkillScript({
      projectRoot,
      skillName: "pdf_financial_extract",
      scriptPath: "scripts/extract_financial_tables.py",
      args: [pdfInput, extractedJson],
      timeoutMs: 120000,
    });

    expect(extractResult.exitCode).toBe(0);
    expect(extractResult.stdout).toContain("Saved financial extraction");

    const analyzeResult = await runSkillScript({
      projectRoot,
      skillName: "financial_statement_analysis",
      scriptPath: "scripts/analyze_balance_sheet.py",
      args: [extractedJson, analyzedJson],
      timeoutMs: 120000,
    });

    expect(analyzeResult.exitCode).toBe(0);
    expect(analyzeResult.stdout).toContain("Saved financial analysis");

    const analyzedRaw = await fs.readFile(analyzedJson, "utf-8");
    const analyzed = JSON.parse(analyzedRaw) as { summary?: { overall_view?: string } };
    expect(analyzed.summary?.overall_view).toContain("资产负债表");
  });
});
