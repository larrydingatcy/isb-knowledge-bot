import { describe, expect, it } from "vitest";
import { loadSourcesFromText } from "./load.js";
import { assertSafeSourceUrl } from "./safe-url.js";
import type { SourceDefinition } from "./schema.js";

const source: SourceDefinition = {
  id: "isb-public",
  name: "ISB public website",
  baseUrl: "https://www.isb.cn/",
  startUrls: ["https://www.isb.cn/"],
  allowedHosts: ["www.isb.cn", "isb.cn"],
  adapter: "html",
  languages: ["en", "zh"],
  categories: ["calendar", "activities"],
  crawlIntervalHours: 24,
  maxPages: 50,
  requestDelayMs: 500,
  visibilityPolicy: "public"
};

describe("source configuration", () => {
  it("loads a valid registry", async () => {
    const result = await loadSourcesFromText(`
- id: isb-public
  name: ISB public website
  baseUrl: https://www.isb.cn/
  startUrls: [https://www.isb.cn/news]
  allowedHosts: [www.isb.cn, isb.cn]
  adapter: html
  languages: [en, zh]
  categories: [calendar]
  crawlIntervalHours: 24
  maxPages: 20
  requestDelayMs: 500
  visibilityPolicy: public
`);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("isb-public");
  });

  it.each([
    ["duplicate ids", `
- { id: same, name: One, baseUrl: https://one.example/, startUrls: [https://one.example/], allowedHosts: [one.example], adapter: html, languages: [en], categories: [calendar], crawlIntervalHours: 1, maxPages: 1, requestDelayMs: 1, visibilityPolicy: public }
- { id: same, name: Two, baseUrl: https://two.example/, startUrls: [https://two.example/], allowedHosts: [two.example], adapter: html, languages: [en], categories: [calendar], crawlIntervalHours: 1, maxPages: 1, requestDelayMs: 1, visibilityPolicy: public }
`],
    ["HTTP URLs", `
- { id: bad, name: Bad, baseUrl: http://example.com/, startUrls: [http://example.com/], allowedHosts: [example.com], adapter: html, languages: [en], categories: [calendar], crawlIntervalHours: 1, maxPages: 1, requestDelayMs: 1, visibilityPolicy: public }
`],
    ["unknown adapters", `
- { id: bad, name: Bad, baseUrl: https://example.com/, startUrls: [https://example.com/], allowedHosts: [example.com], adapter: browser, languages: [en], categories: [calendar], crawlIntervalHours: 1, maxPages: 1, requestDelayMs: 1, visibilityPolicy: public }
`],
    ["non-positive intervals", `
- { id: bad, name: Bad, baseUrl: https://example.com/, startUrls: [https://example.com/], allowedHosts: [example.com], adapter: html, languages: [en], categories: [calendar], crawlIntervalHours: 0, maxPages: 1, requestDelayMs: 1, visibilityPolicy: public }
`]
  ])("rejects %s", async (_name, yaml) => {
    await expect(loadSourcesFromText(yaml)).rejects.toThrow();
  });
});

describe("safe source URL", () => {
  const publicDns = async () => ["8.8.8.8"];

  it("accepts an allowlisted public host", async () => {
    await expect(assertSafeSourceUrl(new URL("https://www.isb.cn/news"), source, publicDns)).resolves.toBeUndefined();
  });

  it("accepts an allowlisted redirect target", async () => {
    await expect(assertSafeSourceUrl(new URL("https://isb.cn/calendar"), source, publicDns)).resolves.toBeUndefined();
  });

  it.each([
    "http://www.isb.cn/",
    "https://evil.example/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://[::1]/"
  ])("blocks unsafe URL %s", async (url) => {
    await expect(assertSafeSourceUrl(new URL(url), source, publicDns)).rejects.toThrow();
  });

  it.each([
    [["127.0.0.1"], "loopback"],
    [["10.0.0.4"], "private"],
    [["169.254.10.2"], "link-local"],
    [["8.8.8.8", "192.168.1.4"], "mixed public/private"],
    [["::1"], "IPv6 loopback"]
  ])("blocks %s DNS answers (%s)", async (addresses) => {
    await expect(assertSafeSourceUrl(new URL("https://www.isb.cn/"), source, async () => addresses)).rejects.toThrow();
  });
});
