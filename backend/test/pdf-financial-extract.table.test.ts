import { describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runSkillScript } from "../src/skill/skill-sandbox";

const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";
const outputDir = path.join(projectRoot, "test", "tmp");

describe("pdf financial extract table mode", () => {
  test("extracts all tables and keeps compatibility fields", async () => {
    const pdfInput = path.join(projectRoot, "files", "pdf-files", "贵州茅台半年报.pdf");
    const outputJson = path.join(outputDir, "financial-extract-table-all.json");

    const result = await runSkillScript({
      projectRoot,
      skillName: "pdf_financial_extract",
      scriptPath: "scripts/extract_financial_tables.py",
      args: [pdfInput, outputJson, "ALL"],
      timeoutMs: 120000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Saved financial extraction");

    const raw = await fs.readFile(outputJson, "utf-8");
    const parsed = JSON.parse(raw) as {
      normalized_balance_sheet?: Record<string, number | null>;
      table_sections?: { all_tables?: unknown[] };
    };
    expect(parsed.normalized_balance_sheet).toBeDefined();
    expect((parsed.table_sections?.all_tables ?? []).length).toBeGreaterThan(0);
  });

  test("matches balance-sheet requested scope to selected tables", async () => {
    const pdfInput = path.join(projectRoot, "files", "pdf-files", "贵州茅台半年报.pdf");
    const outputJson = path.join(outputDir, "financial-extract-table-balance-sheet.json");

    const result = await runSkillScript({
      projectRoot,
      skillName: "pdf_financial_extract",
      scriptPath: "scripts/extract_financial_tables.py",
      args: [pdfInput, outputJson, "资产负债表"],
      timeoutMs: 120000,
    });

    expect(result.exitCode).toBe(0);

    const raw = await fs.readFile(outputJson, "utf-8");
    const parsed = JSON.parse(raw) as {
      table_sections?: {
        selected_tables?: Array<{ title_guess?: string }>;
      };
    };
    const selectedTables = parsed.table_sections?.selected_tables ?? [];
    expect(selectedTables.length).toBeGreaterThan(0);
    expect(selectedTables.some((table) => (table.title_guess ?? "").includes("资产负债"))).toBe(true);
  });
});
