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

  test("auto calls skill by document name even without pdf keyword", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/chat/stream",
      payload: {
        sessionId: "integration-auto-document-route",
        message: "请读取贵州茅台半年报并给出关键信息。",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("skillPlanSteps=1");
    expect(response.body).toContain("skillTriggerSource=auto");
    expect(response.body).toContain("skillStepCompleted=step_1_auto_primary");
  });

  test("auto route wins when message conflicts with fake LLM skill decision", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/chat/stream",
      payload: {
        sessionId: "integration-auto-priority",
        message: "请读取测试.docx，但顺便也提到pdf关键字。",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("skillPlanSteps=2");
    expect(response.body).toContain("skillStepCompleted=step_1_auto_primary");
    expect(response.body).toContain("skillTriggerSource=hybrid");
  });

  test("returns structured error when runtime execution fails", async () => {
    const originalPythonBin = process.env.PYTHON_BIN;
    process.env.PYTHON_BIN = "python_not_exists_for_test";
    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/chat/stream",
        payload: {
          sessionId: "integration-runtime-failure",
          message: "请读取贵州茅台半年报并解析pdf结构。",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("skillStepFailed=step_1_auto_primary");
      expect(response.body).toContain("ENOENT");
    } finally {
      if (typeof originalPythonBin === "string") {
        process.env.PYTHON_BIN = originalPythonBin;
      } else {
        delete process.env.PYTHON_BIN;
      }
    }
  });

  test("runs extract->analyze chain for implicit financial pdf request", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/chat/stream",
      payload: {
        sessionId: "integration-financial-pdf-extract",
        message: "分析贵州茅台半年报的资产负债表。",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("skillPlanSteps=3");
    expect(response.body).toContain("step_2_pdf_balance_sheet_analyze");
    expect(response.body).toContain("step_3_balance_sheet_methodology");
    expect(response.body).toContain("skillTriggerSource=auto");
    expect(response.body).toContain("[SKILL_PLAN]");
    expect(response.body).not.toContain("请确认我已成功提取内容后");
  });
});
