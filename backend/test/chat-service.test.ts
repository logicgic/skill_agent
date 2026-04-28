import { describe, expect, test } from "vitest";
import type { SkillDefinition } from "../src/skill/skill-types";
import type { DocumentCatalog } from "../src/chat/document-router";
import { ChatService } from "../src/chat/chat-service";

describe("chat service system prompt", () => {
  test("includes balance-sheet-analysis routing hint", () => {
    const service = new ChatService({
      projectRoot: "d:/vscode project/FIN_AGENT/skill_agent/backend",
      useFakeLlm: true,
      model: "fake",
    });

    const skills: SkillDefinition[] = [
      {
        name: "balance_sheet_analysis",
        description: "资产负债表分析",
        directory: "d:/tmp/skills/balance_sheet_analysis",
        skillMarkdown: "# balance_sheet_analysis",
      },
      {
        name: "pdf_content_extract",
        description: "PDF提取",
        directory: "d:/tmp/skills/pdf_content_extract",
        skillMarkdown: "# pdf_content_extract",
      },
    ];

    const catalog: DocumentCatalog = {
      documents: [],
      byType: {
        pdf: [],
        docx: [],
        xlsx: [],
      },
    };

    const prompt = (service as unknown as { buildSystemPrompt: (s: SkillDefinition[], c: DocumentCatalog) => string })
      .buildSystemPrompt(skills, catalog);

    expect(prompt).toContain("如果用户要分析资产负债表，优先使用 balance_sheet_analysis skill");
  });
});
