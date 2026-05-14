import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";
import { memory } from "../db/memoryStore.js";

let server: Server;
let baseUrl: string;

beforeAll(() => {
  const app = createApp();
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterEach(() => memory.reset());

afterAll(() => {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("training export", () => {
  it("exports created examples as JSONL with one record per line", async () => {
    for (const i of [1, 2]) {
      const res = await fetch(`${baseUrl}/api/training/examples`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inputText: `Example input ${i}`,
          expectedOutputText: `Example output ${i}`,
          tags: ["smoke"],
        }),
      });
      expect(res.status).toBe(201);
    }

    const res = await fetch(`${baseUrl}/api/training/export.jsonl`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/jsonl");
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const record = JSON.parse(line);
      expect(record.messages).toHaveLength(3);
      expect(record.messages[0].role).toBe("system");
      expect(record.messages[1].role).toBe("user");
      expect(record.messages[2].role).toBe("assistant");
    }
  });
});
