import { Router } from "express";
import { z } from "zod";
import { getRepository } from "../db/repository.js";
import { NotFound } from "../middleware/errors.js";

export const feedbackRouter = Router();

const feedbackSchema = z.object({
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().max(4000).optional().nullable(),
});

feedbackRouter.post("/api/messages/:messageId/feedback", async (req, res, next) => {
  try {
    const repo = getRepository();
    const message = await repo.getMessage(req.params.messageId);
    if (!message) throw NotFound("Message not found");
    const body = feedbackSchema.parse(req.body ?? {});
    const feedback = await repo.upsertFeedback({
      messageId: req.params.messageId,
      rating: body.rating,
      comment: body.comment ?? null,
    });
    res.status(201).json(feedback);
  } catch (err) {
    next(err);
  }
});
