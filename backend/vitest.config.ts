import { defineConfig } from "vitest/config";

/**
 * 后端 Vitest 配置。
 *
 * @remarks
 * 使用 node 环境并提升测试超时时间，以覆盖真实脚本执行场景。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 120000,
  },
});
