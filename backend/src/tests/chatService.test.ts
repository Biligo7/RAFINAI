import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";
import { memory } from "../db/memoryStore.js";
import { resetAIProviderForTests } from "../services/ai/aiClient.js";

let server: Server;
let baseUrl: string;

beforeAll(() => {
  resetAIProviderForTests();
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

describe("chats and messages", () => {
  it("creates, lists, and deletes a chat", async () => {
    const create = await fetch(`${baseUrl}/api/chats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First chat" }),
    });
    expect(create.status).toBe(201);
    const chat = (await create.json()) as any;
    expect(chat.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(chat.title).toBe("First chat");

    const list = (await fetch(`${baseUrl}/api/chats`).then((r) => r.json())) as any;
    expect(list.chats).toHaveLength(1);

    const del = await fetch(`${baseUrl}/api/chats/${chat.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const list2 = (await fetch(`${baseUrl}/api/chats`).then((r) => r.json())) as any;
    expect(list2.chats).toHaveLength(0);
  });

  it("rejects empty message content", async () => {
    const chat = (await fetch(`${baseUrl}/api/chats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Validation chat" }),
    }).then((r) => r.json())) as any;

    const res = await fetch(`${baseUrl}/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("streams an SSE chat completion to done", async () => {
    const chat = (await fetch(`${baseUrl}/api/chats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Streaming chat" }),
    }).then((r) => r.json())) as any;

    const res = await fetch(`${baseUrl}/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hello there" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawCreated = false;
    let sawToken = false;
    let sawCompleted = false;
    let sawDone = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("event: message.created")) sawCreated = true;
      if (buffer.includes("event: token")) sawToken = true;
      if (buffer.includes("event: message.completed")) sawCompleted = true;
      if (buffer.includes("event: done")) {
        sawDone = true;
        break;
      }
    }

    expect(sawCreated).toBe(true);
    expect(sawToken).toBe(true);
    expect(sawCompleted).toBe(true);
    expect(sawDone).toBe(true);

    const messages = (await fetch(`${baseUrl}/api/chats/${chat.id}/messages`).then((r) => r.json())) as any;
    expect(messages.messages).toHaveLength(2);
    expect(messages.messages[0].role).toBe("user");
    expect(messages.messages[1].role).toBe("assistant");
    expect(messages.messages[1].content.length).toBeGreaterThan(0);
  });
});
