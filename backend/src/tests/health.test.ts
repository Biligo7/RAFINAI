import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.js";

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

afterAll(() => {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("health endpoints", () => {
  it("GET /healthz returns 200 with service info", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "backend" });
  });

  it("GET /readyz returns 200 with the in-memory fallback", async () => {
    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ready");
  });

  it("GET /api/config never returns secrets", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty("appName");
    expect(body).toHaveProperty("aiProvider");
    expect(body.streamingEnabled).toBe(true);
    const json = JSON.stringify(body).toLowerCase();
    expect(json).not.toContain("password");
    expect(json).not.toContain("api_key");
    expect(json).not.toContain("connection");
  });
});
