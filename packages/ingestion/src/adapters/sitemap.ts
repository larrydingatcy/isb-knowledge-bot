import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { fetchHtmlDocument } from "./html.js";
import type { SourceAdapter } from "./types.js";

export const sitemapAdapter: SourceAdapter = {
  async *collect(context) {
    const sitemapUrl = new URL(context.source.startUrls[0]!);
    if (!(await context.canFetch(sitemapUrl))) return;
    const sitemap = await context.fetch(sitemapUrl);
    const type = sitemap.headers["content-type"]?.toLowerCase() ?? "";
    if (!type.includes("xml")) throw new Error(`Unsupported content type: ${type || "missing"}`);
    const $ = cheerio.load(sitemap.body, { xmlMode: true });
    const urls = $("url > loc").map((_, element) => $(element).text().trim()).get().slice(0, context.source.maxPages);
    const seen = new Set<string>();
    for (const value of urls) {
      await context.delay(context.source.requestDelayMs);
      const document = await fetchHtmlDocument(context, new URL(value));
      if (!document) continue;
      const hash = createHash("sha256").update(document.text).digest("hex");
      if (seen.has(hash)) continue;
      seen.add(hash);
      yield document;
    }
  }
};
