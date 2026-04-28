import dotenv from "dotenv";
import { createServer } from "./server.js";
import { loadAppConfig } from "./config.js";
import { resolveBackendEnvPath, resolveBackendRootFromModuleUrl } from "./path-manager.js";
import { runPythonDependencyHealthCheck } from "./skill/skill-health.js";

/**
 * 启动 HTTP 服务。
 */
const bootstrap = async (): Promise<void> => {
  const projectRoot = resolveBackendRootFromModuleUrl(import.meta.url);
  dotenv.config({ path: resolveBackendEnvPath(projectRoot) });
  const config = loadAppConfig(projectRoot);
  const healthCheck = await runPythonDependencyHealthCheck();

  const server = createServer({
    projectRoot: config.projectRoot,
    useFakeLlm: config.useFakeLlm,
    apiKey: config.openAIApiKey,
    baseURL: config.openAIBaseUrl,
    model: config.openAIModel,
  });

  await server.listen({
    host: "0.0.0.0",
    port: config.port,
  });

  // eslint-disable-next-line no-console
  console.log(`Skill agent backend is running on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(healthCheck);
};

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

