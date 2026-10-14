import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeModules = [
  "api/v1/chat.ts",
  "packages/answering/src/answer.ts",
  "packages/answering/src/model.ts",
  "packages/answering/src/prompt.ts",
  "packages/answering/src/types.ts",
  "packages/api-core/src/handler.ts",
  "packages/api-core/src/cors.ts",
  "packages/api-core/src/rate-limit.ts",
  "packages/api-core/src/request.ts",
  "packages/knowledge/src/index.ts",
  "packages/knowledge/src/retrieval.ts",
] as const;

describe("Vercel runtime imports", () => {
  it.each(runtimeModules)("does not externalize workspace source from %s", async (modulePath) => {
    const source = await readFile(resolve(root, modulePath), "utf8");

    expect(source).not.toContain('from "@isb/');
  });
});
