import { createHash } from "node:crypto";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM, VirtualConsole } from "jsdom";
import type { AdapterContext, RawDocument, SourceAdapter } from "./types.js";

function contentType(response: { headers: Record<string, string | undefined> }): string {
  return response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function parseHtmlDocument(html: string, responseUrl: string, fetchedAt: string): RawDocument {
  const $ = cheerio.load(html);
  const canonical = $("link[rel='canonical']").attr("href") || responseUrl;
  const dom = new JSDOM(html, { url: responseUrl, virtualConsole: new VirtualConsole() });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+/g, " ").trim() || $("main").text().replace(/\s+/g, " ").trim();
  const language = ($("html").attr("lang") || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  const published = $("meta[property='article:published_time']").attr("content") || $("time[datetime]").attr("datetime");
  return {
    canonicalUrl: new URL(canonical, responseUrl).href,
    title: article?.title?.trim() || $("title").text().trim(),
    language,
    html,
    text,
    ...(published ? { publishedAt: new Date(published).toISOString() } : {}),
    fetchedAt,
    attachments: $("a[href]").map((_, element) => $(element).attr("href") || "").get().filter((href) => /\.(pdf|docx?)($|\?)/i.test(href)).map((href) => new URL(href, responseUrl).href)
  };
}

export async function fetchHtmlDocument(context: AdapterContext, url: URL): Promise<RawDocument | undefined> {
  if (!(await context.canFetch(url))) return undefined;
  const response = await context.fetch(url);
  if (response.status < 200 || response.status >= 300) throw new Error(`Unexpected HTTP status ${response.status}`);
  const type = contentType(response);
  if (type !== "text/html" && type !== "application/xhtml+xml") throw new Error(`Unsupported content type: ${type || "missing"}`);
  return parseHtmlDocument(response.body, response.url, context.now().toISOString());
}

export const htmlAdapter: SourceAdapter = {
  async *collect(context) {
    const seen = new Set<string>();
    const urls = context.source.startUrls.slice(0, context.source.maxPages);
    for (let index = 0; index < urls.length; index += 1) {
      if (index > 0) await context.delay(context.source.requestDelayMs);
      const document = await fetchHtmlDocument(context, new URL(urls[index]!));
      if (!document) continue;
      const hash = createHash("sha256").update(document.text).digest("hex");
      if (seen.has(hash)) continue;
      seen.add(hash);
      yield document;
    }
  }
};
