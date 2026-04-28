import path from "node:path";
import dotenv from "dotenv";
import { createServer } from "./server";
import { loadAppConfig } from "./config";
dotenv.config();
/**
 * 启动 HTTP 服务。
 */
const bootstrap = async () => {
    const projectRoot = path.resolve(process.cwd());
    const config = loadAppConfig(projectRoot);
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
};
bootstrap().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
