import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SourceDefinition } from "../config/schema.js";
import { createAdapter } from "./registry.js";
import type { AdapterContext, FetchResponse } from "./types.js";

const fixture = (name: string) => readFile(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), "utf8");
const base: SourceDefinition = {
  id: "isb", name: "ISB", baseUrl: "https://www.isb.cn/", startUrls: ["https://www.isb.cn/news"],
  allowedHosts: ["www.isb.cn"], adapter: "html", languages: ["en"], categories: ["activities"],
  crawlIntervalHours: 24, maxPages: 2, requestDelayMs: 10, visibilityPolicy: "public"
};

function response(url: string, body: string, contentType = "text/html"): FetchResponse {
  return { url, status: 200, headers: { "content-type": contentType }, body };
}

async function collect(context: AdapterContext) {
  const output = [];
  for await (const item of createAdapter(context.source.adapter).collect(context)) output.push(item);
  return output;
}

describe("public adapters", () => {
  it("extracts canonical URL, title, main content, language, and date", async () => {
    const html = await fixture("official-page.html");
    const documents = await collect({ source: base, fetch: async () => response(base.startUrls[0]!, html), delay: vi.fn(), canFetch: async () => true, now: () => new Date("2026-10-13T00:00:00Z") });
    expect(documents[0]).toMatchObject({
      canonicalUrl: "https://www.isb.cn/activities/update",
      title: "ISB Activities Update",
      language: "en",
      publishedAt: "2026-10-09T00:00:00.000Z",
      fetchedAt: "2026-10-13T00:00:00.000Z"
    });
    expect(documents[0]?.text).toContain("Registration details");
    expect(documents[0]?.text).not.toContain("Navigation");
  });

  it("caps sitemap traversal and invokes the configured delay", async () => {
    const [xml, html] = await Promise.all([fixture("sitemap.xml"), fixture("official-page.html")]);
    const source = { ...base, adapter: "sitemap" as const, startUrls: ["https://www.isb.cn/sitemap.xml"], maxPages: 2 };
    const delay = vi.fn(async () => undefined);
    const fetch = vi.fn(async (url: URL) => url.pathname.endsWith(".xml") ? response(url.href, xml, "application/xml") : response(url.href, html));
    const documents = await collect({ source, fetch, delay, canFetch: async () => true, now: () => new Date() });
    expect(documents).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(10);
  });

  it("does not fetch URLs denied by robots", async () => {
    const fetch = vi.fn();
    const documents = await collect({ source: base, fetch, delay: vi.fn(), canFetch: async () => false, now: () => new Date() });
    expect(documents).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates identical page content", async () => {
    const html = await fixture("official-page.html");
    const source = { ...base, startUrls: ["https://www.isb.cn/a", "https://www.isb.cn/b"] };
    const documents = await collect({ source, fetch: async (url) => response(url.href, html), delay: vi.fn(), canFetch: async () => true, now: () => new Date() });
    expect(documents).toHaveLength(1);
  });

  it("rejects unsupported response content types", async () => {
    await expect(collect({ source: base, fetch: async (url) => response(url.href, "binary", "image/png"), delay: vi.fn(), canFetch: async () => true, now: () => new Date() })).rejects.toThrow(/content type/i);
  });

  it("rejects unknown adapter names", () => {
    expect(() => createAdapter("browser" as "html")).toThrow(/unknown adapter/i);
  });
});
