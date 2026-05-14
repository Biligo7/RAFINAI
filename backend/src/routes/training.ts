import { Router } from "express";
import { z } from "zod";
import { getRepository } from "../db/repository.js";
import { streamExportJsonl } from "../services/trainingService.js";

export const trainingRouter = Router();

const datasetSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(4000).optional().nullable(),
});

const exampleSchema = z.object({
  datasetId: z.string().uuid().optional().nullable(),
  sourceChatId: z.string().uuid().optional().nullable(),
  sourceUserMessageId: z.string().uuid().optional().nullable(),
  sourceAssistantMessageId: z.string().uuid().optional().nullable(),
  inputText: z.string().min(1).max(32_000),
  expectedOutputText: z.string().min(1).max(32_000),
  tags: z.array(z.string().max(64)).max(32).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

trainingRouter.get("/api/training/datasets", async (_req, res, next) => {
  try {
    const datasets = await getRepository().listDatasets();
    res.json({ datasets });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/api/training/datasets", async (req, res, next) => {
  try {
    const body = datasetSchema.parse(req.body ?? {});
    const dataset = await getRepository().createDataset(body);
    res.status(201).json(dataset);
  } catch (err) {
    next(err);
  }
});

trainingRouter.get("/api/training/examples", async (req, res, next) => {
  try {
    const datasetId = typeof req.query.datasetId === "string" ? req.query.datasetId : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const examples = await getRepository().listExamples({
      datasetId: datasetId ?? null,
      limit: Number.isFinite(limitRaw) ? Number(limitRaw) : undefined,
    });
    res.json({ examples });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post("/api/training/examples", async (req, res, next) => {
  try {
    const body = exampleSchema.parse(req.body ?? {});
    const example = await getRepository().createExample(body);
    res.status(201).json(example);
  } catch (err) {
    next(err);
  }
});

trainingRouter.get("/api/training/export.jsonl", async (req, res, next) => {
  try {
    const datasetId = typeof req.query.datasetId === "string" ? req.query.datasetId : undefined;
    res.status(200);
    res.setHeader("Content-Type", "application/jsonl; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="training-examples.jsonl"`);
    for await (const line of streamExportJsonl({ datasetId: datasetId ?? null })) {
      res.write(line);
    }
    res.end();
  } catch (err) {
    next(err);
  }
});
