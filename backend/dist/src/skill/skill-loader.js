import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveSkillDirectory } from "../config.js";
/**
 * 从 SKILL.md 中提取 frontmatter。
 */
const parseFrontmatter = (markdown) => {
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
        throw new Error("SKILL.md 缺少 frontmatter");
    }
    const lines = frontmatterMatch[1].split("\n");
    const rawMap = {};
    for (const line of lines) {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex <= 0) {
            continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
        rawMap[key] = value;
    }
    if (!rawMap.name || !rawMap.description) {
        throw new Error("frontmatter 缺少 name 或 description");
    }
    return {
        name: rawMap.name,
        description: rawMap.description,
    };
};
/**
 * 加载项目中所有符合官方结构（目录下有 SKILL.md）的 skill。
 */
export const loadSkills = async (projectRoot) => {
    const skillRootDirectory = resolveSkillDirectory(projectRoot);
    const candidates = await fs.readdir(skillRootDirectory, { withFileTypes: true });
    const loadedSkills = [];
    for (const candidate of candidates) {
        if (!candidate.isDirectory()) {
            continue;
        }
        const skillDirectory = path.join(skillRootDirectory, candidate.name);
        const skillMarkdownPath = path.join(skillDirectory, "SKILL.md");
        try {
            const skillMarkdown = await fs.readFile(skillMarkdownPath, "utf-8");
            const frontmatter = parseFrontmatter(skillMarkdown);
            loadedSkills.push({
                name: frontmatter.name,
                description: frontmatter.description,
                directory: skillDirectory,
                skillMarkdown,
            });
        }
        catch {
            // 非官方结构或损坏的 skill 会被忽略，不中断主流程。
        }
    }
    return loadedSkills.sort((leftSkill, rightSkill) => leftSkill.name.localeCompare(rightSkill.name));
};
