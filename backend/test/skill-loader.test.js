import { describe, expect, test } from "vitest";
import { loadSkills } from "../src/skill/skill-loader";
const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";
describe("skill loader", () => {
    test("loads official skills and extracts name/description", async () => {
        const skills = await loadSkills(projectRoot);
        const names = skills.map((skill) => skill.name).sort();
        expect(names).toEqual(["docx", "pdf", "xlsx"]);
        const pdfSkill = skills.find((skill) => skill.name === "pdf");
        expect(pdfSkill?.description.length).toBeGreaterThan(10);
        expect(pdfSkill?.skillMarkdown).toContain("# PDF Processing Guide");
    });
});
