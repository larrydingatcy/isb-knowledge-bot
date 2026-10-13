import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel configuration", () => {
  it("lets Vercel select the Node.js runtime for TypeScript functions", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    ) as { functions?: Record<string, { runtime?: string }> };

    expect(config.functions?.["api/**/*.ts"]?.runtime).toBeUndefined();
  });
});
