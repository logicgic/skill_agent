import { describe, expect, test } from "vitest";
import { createServer } from "../src/server";

const projectRoot = "d:/vscode project/FIN_AGENT/skill_agent/backend";

describe("chat no-fake fallback", () => {
  test("throws explicit error when fake llm is disabled and api key is missing", () => {
    /**
     * 业务约束：
     * - useFakeLlm=false 时必须配置真实 API Key；
     * - 不允许再自动回退到 Fake 演示回答。
     */
    expect(() =>
      createServer({
        projectRoot,
        useFakeLlm: false,
      })).toThrow("未配置真实模型 API Key，已禁用 Fake 回退");
  });
});
