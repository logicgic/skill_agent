import { beforeAll, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runSkillScript } from "../src/skill/skill-sandbox.js";

/**
 * Skill 沙箱执行测试。
 *
 * @remarks
 * 使用真实依赖验证脚本执行成功路径与路径逃逸拦截逻辑。
 */
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

  test("executes pdf content extraction script in sandbox", async () => {
    const pdfInput = path.join(projectRoot, "files", "pdf-files", "贵州茅台半年报.pdf");
    const extractedJson = path.join(outputDir, "pdf-content-extract.json");

    const extractResult = await runSkillScript({
      projectRoot,
      skillName: "pdf_content_extract",
      scriptPath: "scripts/extract_pdf_content.py",
      args: [pdfInput, extractedJson],
      timeoutMs: 120000,
    });

    expect(extractResult.exitCode).toBe(0);
    expect(extractResult.stdout).toContain("Saved PDF content extraction");

    const extractedRaw = await fs.readFile(extractedJson, "utf-8");
    const extracted = JSON.parse(extractedRaw) as { pages?: { page_number: number }[] };
    expect((extracted.pages ?? []).length).toBeGreaterThan(0);
  });

  test("executes balance-sheet analysis script from extracted json in sandbox", async () => {
    const extractedJson = path.join(outputDir, "pdf-content-extract.json");
    const analysisJson = path.join(outputDir, "pdf-balance-sheet-analysis.json");

    const result = await runSkillScript({
      projectRoot,
      skillName: "pdf_content_extract",
      scriptPath: "scripts/analyze_balance_sheet_from_extract.py",
      args: [extractedJson, analysisJson],
      timeoutMs: 120000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Saved balance-sheet analysis");

    const raw = await fs.readFile(analysisJson, "utf-8");
    const parsed = JSON.parse(raw) as { summary?: { overall_view?: string } };
    expect(parsed.summary?.overall_view).toContain("资产负债表");
  });
});
