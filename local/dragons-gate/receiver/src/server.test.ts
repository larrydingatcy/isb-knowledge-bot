import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { receiverListenOptions } from "./config.js";
import { createReceiver } from "./server.js";

const token = "t".repeat(48);
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const payload = { runId: "run-1", nonce: "nonce-12345678", url: "https://dragonsgate.isb.cn/general", title: "General notice", text: "General school information for all families.", capturedAt: "2026-10-13T00:00:00.000Z" };

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dg-receiver-"));
  const logs: string[] = [];
  const app = createReceiver({ token, extensionId, captureRoot: root, log: (message) => logs.push(message) });
  return { app, root, logs };
}
const headers = { authorization: `Bearer ${token}`, origin: `chrome-extension://${extensionId}`, host: "127.0.0.1:43117", "content-type": "application/json" };

describe("loopback receiver", () => {
  it("binds only to loopback", () => {
    expect(receiverListenOptions()).toEqual([{ host: "127.0.0.1", port: 43117 }, { host: "::1", port: 43117 }]);
  });

  it.each([
    [Object.fromEntries(Object.entries(headers).filter(([key]) => key !== "authorization")), "missing token"],
    [{ ...headers, authorization: "Bearer wrong" }, "wrong token"],
    [{ ...headers, origin: "chrome-extension://wrong" }, "wrong extension"],
    [{ ...headers, origin: "https://dragonsgate.isb.cn" }, "browser page origin"],
    [{ ...headers, host: "evil.example" }, "wrong host"]
  ])("rejects %s (%s)", async (requestHeaders) => {
    const { app } = await setup();
    const response = await app.inject({ method: "POST", url: "/v1/captures", headers: requestHeaders as Record<string, string>, payload });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("rejects non-JSON, oversized, invalid, and replayed captures", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "POST", url: "/v1/captures", headers: { ...headers, "content-type": "text/plain" }, payload: "x" })).statusCode).toBe(415);
    expect((await app.inject({ method: "POST", url: "/v1/captures", headers, payload: { ...payload, url: "not-a-url" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/captures", headers, payload: { ...payload, text: "x".repeat(2 * 1024 * 1024) } })).statusCode).toBe(413);
    expect((await app.inject({ method: "POST", url: "/v1/captures", headers, payload })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/v1/captures", headers, payload })).statusCode).toBe(409);
    await app.close();
  });

  it("accepts a valid capture without logging body or token", async () => {
    const { app, root, logs } = await setup();
    const response = await app.inject({ method: "POST", url: "/v1/captures", headers, payload });
    expect(response.statusCode).toBe(202);
    expect(response.json().draftId).toMatch(/^capture-/);
    const stored = JSON.parse(await readFile(join(root, "run-1", `${response.json().draftId}.json`), "utf8"));
    expect(stored.text).toContain("General school information");
    expect(logs.join(" ")).not.toContain(payload.text);
    expect(logs.join(" ")).not.toContain(token);
    await app.close();
  });

  it("provides health and run completion routes", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/v1/health", headers: { host: "127.0.0.1:43117" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/runs/run-1/complete", headers, payload: { status: "complete" } })).statusCode).toBe(202);
    await app.close();
  });
});
