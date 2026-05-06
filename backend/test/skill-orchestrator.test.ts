import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildDocumentCatalog } from "../src/chat/document-router.js";
import { runSkillPlan } from "../src/chat/skill-orchestrator.js";

const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";

describe("skill orchestrator", () => {
  test("runs steps sequentially and continues on non-required failure", async () => {
    const catalog = await buildDocumentCatalog(projectRoot);
    const outputJson = path.join(projectRoot, "files", "parsed", "pdf", "plan-test-output.json");

    const execution = await runSkillPlan({
      projectRoot,
      catalog,
      continueOnError: true,
      plan: {
        triggerSource: "llm",
        planReason: "test",
        steps: [
          {
            id: "step_1",
            skillName: "pdf_content_extract",
            scriptPath: "scripts/extract_pdf_content.py",
            args: ["{FILE_PDF}", outputJson],
            reason: "extract",
            required: true,
          },
          {
            id: "step_2",
            skillName: "pdf_content_extract",
            scriptPath: "scripts/not_exists.py",
            args: [],
            reason: "intentional failure",
            required: false,
          },
          {
            id: "step_3",
            skillName: "balance_sheet_analysis",
            scriptPath: "",
            args: [],
            reason: "no script",
            required: false,
          },
        ],
      },
    });

    expect(execution.stepResults.length).toBe(3);
    expect(execution.stepResults[0]?.status).toBe("success");
    expect(execution.stepResults[1]?.status).toBe("failed");
    expect(execution.stepResults[2]?.status).toBe("skipped");
  });
});
