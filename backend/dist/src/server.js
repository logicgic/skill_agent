import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { ChatService } from "./chat/chat-service.js";
/**
 * 创建 Fastify 服务实例。
 */
export const createServer = (options) => {
    const server = Fastify({ logger: false });
    const chatService = new ChatService({
        projectRoot: options.projectRoot,
        useFakeLlm: options.useFakeLlm,
        apiKey: options.apiKey,
        baseURL: options.baseURL,
        model: options.model ?? "gpt-4.1-mini",
    });
    server.register(cors, {
        origin: true,
    });
    const chatPayloadSchema = z.object({
        sessionId: z.string().min(1),
        message: z.string().min(1),
    });
    server.post("/api/chat/stream", async (request, reply) => {
        const payload = chatPayloadSchema.parse(request.body);
        // 接管原始响应，避免 Fastify 在流式过程中再次写入响应头。
        reply.hijack();
        const requestOrigin = request.headers.origin;
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // 在 hijack 模式下需要手动补充 CORS 响应头，否则浏览器会拦截流式响应。
            "Access-Control-Allow-Origin": requestOrigin ?? "*",
            Vary: "Origin",
        });
        try {
            for await (const event of chatService.chat(payload.sessionId, payload.message)) {
                if (reply.raw.destroyed || reply.raw.writableEnded || request.raw.aborted) {
                    break;
                }
                reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
            }
        }
        catch (error) {
            if (!reply.raw.destroyed && !reply.raw.writableEnded) {
                const message = error instanceof Error ? error.message : String(error);
                reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
            }
        }
        finally {
            if (!reply.raw.destroyed && !reply.raw.writableEnded) {
                reply.raw.end();
            }
        }
    });
    return server;
};
