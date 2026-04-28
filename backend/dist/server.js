import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { ChatService } from "./chat/chat-service";
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
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        });
        for await (const event of chatService.chat(payload.sessionId, payload.message)) {
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        reply.raw.end();
        return reply;
    });
    return server;
};
