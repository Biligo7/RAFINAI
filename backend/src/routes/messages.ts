import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getRepository } from "../db/repository.js";
import { generateChatResponse } from "../services/chatService.js";
import { NotFound, Validation } from "../middleware/errors.js";

export const messagesRouter = Router();

const sendSchema = z.object({
  content: z.string().min(1).max(config.ai.maxInputChars),
  temperature: z.number().min(0).max(2).optional(),
  systemPromptOverride: z.string().max(4000).nullable().optional(),
});

messagesRouter.get("/api/chats/:chatId/messages", async (req, res, next) => {
  try {
    const chat = await getRepository().getChat(req.params.chatId);
    if (!chat) throw NotFound("Chat not found");
    const messages = await getRepository().listMessages(req.params.chatId);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

messagesRouter.post("/api/chats/:chatId/messages", async (req, res, next) => {
  let streamOpened = false;
  try {
    const chat = await getRepository().getChat(req.params.chatId);
    if (!chat) throw NotFound("Chat not found");

    const body = sendSchema.parse(req.body ?? {});
    if (body.content.trim().length === 0) throw Validation("Message content is required");

    const userMessage = await getRepository().insertMessage({
      chatId: req.params.chatId,
      role: "user",
      content: body.content,
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    streamOpened = true;

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await generateChatResponse({
        chatId: req.params.chatId,
        userMessage,
        requestId: req.requestId,
        handlers: {
          onAssistantStart: (messageId) => writeEvent("message.created", { messageId, role: "assistant" }),
          onToken: (delta) => writeEvent("token", { delta }),
        },
      });

      writeEvent("message.completed", { messageId: result.assistantMessageId, content: result.full });
      writeEvent("done", {});
    } catch (err) {
      writeEvent("error", {
        code: "AI_PROVIDER_ERROR",
        message: err instanceof Error ? err.message : "Provider error",
      });
    } finally {
      res.end();
    }
  } catch (err) {
    if (streamOpened) {
      res.end();
      return;
    }
    next(err);
  }
});
