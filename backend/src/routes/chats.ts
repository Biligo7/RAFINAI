import { Router } from "express";
import { z } from "zod";
import { getRepository } from "../db/repository.js";
import { NotFound } from "../middleware/errors.js";

export const chatsRouter = Router();

const createSchema = z.object({
  title: z.string().min(1).max(256),
  systemPrompt: z.string().max(4000).optional().nullable(),
});

const patchSchema = z
  .object({
    title: z.string().min(1).max(256).optional(),
    systemPrompt: z.string().max(4000).optional().nullable(),
  })
  .refine((v) => v.title !== undefined || v.systemPrompt !== undefined, "No fields to update");

chatsRouter.get("/api/chats", async (_req, res, next) => {
  try {
    const chats = await getRepository().listChats();
    res.json({ chats });
  } catch (err) {
    next(err);
  }
});

chatsRouter.post("/api/chats", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body ?? {});
    const chat = await getRepository().createChat(body);
    res.status(201).json(chat);
  } catch (err) {
    next(err);
  }
});

chatsRouter.get("/api/chats/:chatId", async (req, res, next) => {
  try {
    const chat = await getRepository().getChat(req.params.chatId);
    if (!chat) throw NotFound("Chat not found");
    res.json(chat);
  } catch (err) {
    next(err);
  }
});

chatsRouter.patch("/api/chats/:chatId", async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body ?? {});
    const chat = await getRepository().updateChat(req.params.chatId, patch);
    if (!chat) throw NotFound("Chat not found");
    res.json(chat);
  } catch (err) {
    next(err);
  }
});

chatsRouter.delete("/api/chats/:chatId", async (req, res, next) => {
  try {
    const existing = await getRepository().getChat(req.params.chatId);
    if (!existing) throw NotFound("Chat not found");
    await getRepository().archiveChat(req.params.chatId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
