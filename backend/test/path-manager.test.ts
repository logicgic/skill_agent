import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveBackendRootFromModuleUrl, resolveScriptArgPlaceholders } from "../src/path-manager.js";
import type { DocumentCatalog } from "../src/chat/document-router.js";

describe("path manager", () => {
  test("resolves backend root from module url", () => {
    const root = resolveBackendRootFromModuleUrl(import.meta.url);
    expect(path.basename(root)).toBe("backend");
  });

  test("replaces placeholder args using document catalog", () => {
    const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";
    const catalog: DocumentCatalog = {
      documents: [
        {
          absolutePath: path.join(projectRoot, "files", "pdf-files", "a.pdf"),
          relativePath: "files/pdf-files/a.pdf",
          baseName: "a",
          extension: ".pdf",
          type: "pdf",
        },
      ],
      byType: {
        pdf: [
          {
            absolutePath: path.join(projectRoot, "files", "pdf-files", "a.pdf"),
            relativePath: "files/pdf-files/a.pdf",
            baseName: "a",
            extension: ".pdf",
            type: "pdf",
          },
        ],
        docx: [],
        xlsx: [],
      },
    };

    const args = resolveScriptArgPlaceholders(["{FILE_PDF}", "{OUTPUT_JSON}"], {
      projectRoot,
      catalog,
    });

    expect(args[0]).toContain("files");
    expect(args[0]).toContain("pdf-files");
    expect(args[1]).toContain("files");
    expect(args[1]).toContain("parsed");
  });
});
