import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";

const CaptureSchema = z.object({
  runId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  nonce: z.string().min(12).max(200),
  url: z.string().refine((value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "capture URL must use HTTPS"),
  title: z.string().min(1).max(500),
  text: z.string().min(1).max(2 * 1024 * 1024),
  capturedAt: z.string().datetime({ offset: true })
});

interface ReceiverDeps { token: string; extensionId: string; captureRoot: string; log?: (message: string) => void }

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

function validHost(request: FastifyRequest): boolean {
  const host = (request.headers.host ?? "").toLowerCase();
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || /^\[::1\](:\d+)?$/.test(host);
}

export function createReceiver(deps: ReceiverDeps) {
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024, logger: false });
  const nonces = new Set<string>();
  const log = deps.log ?? (() => undefined);

  app.addHook("onRequest", async (request, reply) => {
    if (!validHost(request)) return reply.code(403).send({ error: "invalid host" });
    if (request.method === "GET" && request.url === "/v1/health") return;
    if (request.headers["content-type"]?.split(";")[0] !== "application/json") return reply.code(415).send({ error: "application/json required" });
    if (request.headers.origin !== `chrome-extension://${deps.extensionId}`) return reply.code(403).send({ error: "invalid origin" });
    const authorization = request.headers.authorization ?? "";
    const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!constantTimeEqual(candidate, deps.token)) return reply.code(401).send({ error: "invalid token" });
  });

  app.get("/v1/health", async () => ({ ok: true }));

  app.post("/v1/captures", async (request, reply) => {
    const parsed = CaptureSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid capture" });
    if (nonces.has(parsed.data.nonce)) return reply.code(409).send({ error: "replayed capture" });
    nonces.add(parsed.data.nonce);
    const hash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    const draftId = `capture-${hash.slice(0, 20)}`;
    const directory = join(deps.captureRoot, parsed.data.runId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, `${draftId}.json`), `${JSON.stringify(parsed.data)}\n`, { mode: 0o600 });
    log(JSON.stringify({ event: "capture-accepted", runId: parsed.data.runId, draftId, bytes: Buffer.byteLength(parsed.data.text), hash }));
    return reply.code(202).send({ draftId });
  });

  app.post("/v1/runs/:runId/complete", async (request, reply) => {
    const runId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).safeParse((request.params as { runId?: string }).runId);
    const body = z.object({ status: z.enum(["complete", "login-expired", "failed"]) }).safeParse(request.body);
    if (!runId.success || !body.success) return reply.code(400).send({ error: "invalid completion" });
    const directory = join(deps.captureRoot, runId.data);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, "complete.json"), `${JSON.stringify({ ...body.data, completedAt: new Date().toISOString(), nonce: randomUUID() })}\n`, { mode: 0o600 });
    log(JSON.stringify({ event: "run-complete", runId: runId.data, status: body.data.status }));
    return reply.code(202).send({ ok: true });
  });
  return app;
}
