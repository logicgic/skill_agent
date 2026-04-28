import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer } from "../src/server";
const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";
describe("chat integration", () => {
    const server = createServer({
        projectRoot,
        useFakeLlm: true,
    });
    beforeAll(async () => {
        await server.ready();
    });
    afterAll(async () => {
        await server.close();
    });
    test("streams response with session memory", async () => {
        const first = await server.inject({
            method: "POST",
            url: "/api/chat/stream",
            payload: {
                sessionId: "integration-session",
                message: "请帮我读取pdf文件并说明内容结构。",
            },
        });
        expect(first.statusCode).toBe(200);
        expect(first.headers["content-type"]).toContain("text/event-stream");
        expect(first.body).toContain("data:");
        const second = await server.inject({
            method: "POST",
            url: "/api/chat/stream",
            payload: {
                sessionId: "integration-session",
                message: "继续总结上一次回答。",
            },
        });
        expect(second.statusCode).toBe(200);
        expect(second.body).toContain("继续总结上一次回答");
    });
});
