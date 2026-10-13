import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createReceiver } from "./server.js";

const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: start.ts <private-config.json>");
const config = JSON.parse(await readFile(resolve(configPath), "utf8")) as { token: string; extensionId: string; captureRoot: string; port?: number };
const app = createReceiver({ token: config.token, extensionId: config.extensionId, captureRoot: config.captureRoot });
await app.listen({ host: "127.0.0.1", port: config.port ?? 43117 });
