import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runIngestCli } from "./ingest.js";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "isb-cli-"));
  const config = join(root, "sources.yml");
  await writeFile(config, `- { id: isb, name: ISB, baseUrl: https://www.isb.cn/, startUrls: [https://www.isb.cn/], allowedHosts: [www.isb.cn], adapter: html, languages: [en], categories: [calendar], crawlIntervalHours: 24, maxPages: 2, requestDelayMs: 10, visibilityPolicy: public }\n`);
  return { root, config, drafts: join(root, "drafts"), knowledge: join(root, "knowledge") };
}

describe("ingestion CLI", () => {
  it("prints help", async () => {
    const paths = await workspace();
    const result = await runIngestCli(["--help"], { paths });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("ingest crawl");
  });

  it("rejects unknown commands and sources", async () => {
    const paths = await workspace();
    expect((await runIngestCli(["nope"], { paths })).exitCode).toBe(2);
    expect((await runIngestCli(["crawl", "missing", "--dry-run"], { paths })).exitCode).toBe(2);
  });

  it("validates source configuration", async () => {
    const paths = await workspace();
    const result = await runIngestCli(["source", "validate"], { paths });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.json!)).toMatchObject({ sources: 1, valid: true });
  });

  it("keeps crawl dry runs mutation-free and returns JSON", async () => {
    const paths = await workspace();
    await writeFile(paths.knowledge, "sentinel");
    const crawl = vi.fn();
    const result = await runIngestCli(["crawl", "isb", "--dry-run"], { paths, crawl });
    expect(result.exitCode).toBe(0);
    expect(crawl).not.toHaveBeenCalled();
    expect(await readFile(paths.knowledge, "utf8")).toBe("sentinel");
    expect(JSON.parse(result.json!)).toMatchObject({ dryRun: true, sourceIds: ["isb"] });
  });

  it("returns a nonzero code when crawl fails", async () => {
    const paths = await workspace();
    const result = await runIngestCli(["crawl", "isb"], { paths, crawl: async () => { throw new Error("network down"); } });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.json!)).toMatchObject({ ok: false });
  });

  it("previews without mutation and requires approved drafts to publish", async () => {
    const paths = await workspace();
    const preview = vi.fn(async () => ({ id: "d1", state: "draft" }));
    const publish = vi.fn();
    const result = await runIngestCli(["draft", "preview", "d1"], { paths, draftActions: { preview }, publish });
    expect(result.exitCode).toBe(0);
    expect(preview).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    const blocked = await runIngestCli(["publish"], { paths, draftActions: { list: async () => [{ id: "d1", state: "draft" }] }, publish });
    expect(blocked.exitCode).toBe(2);
  });

  it("publishes a completed public crawl without requiring an upload draft", async () => {
    const paths = await workspace();
    const crawlDir = join(paths.drafts, "crawl");
    await mkdir(crawlDir, { recursive: true });
    const captured = [{ sourceId: "isb", document: { canonicalUrl: "https://www.isb.cn/notice", title: "General notice", language: "en", text: "General school notice for all families with important calendar information.", fetchedAt: "2026-10-13T00:00:00.000Z", attachments: [] } }];
    await writeFile(join(crawlDir, "latest.json"), JSON.stringify(captured));
    const result = await runIngestCli(["publish"], { paths });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(join(paths.knowledge, "items.json"), "utf8"))).toHaveLength(1);
    const before = await Promise.all([readFile(join(paths.knowledge, "items.json"), "utf8"), readFile(join(paths.knowledge, "manifest.json"), "utf8")]);
    await mkdir(crawlDir, { recursive: true });
    await writeFile(join(crawlDir, "latest.json"), JSON.stringify(captured));
    const repeated = await runIngestCli(["publish"], { paths });
    const after = await Promise.all([readFile(join(paths.knowledge, "items.json"), "utf8"), readFile(join(paths.knowledge, "manifest.json"), "utf8")]);
    expect(JSON.parse(repeated.json!).result).toMatchObject({ noChange: true });
    expect(after).toEqual(before);
  });

  it("requires confirmation before withdrawal", async () => {
    const paths = await workspace();
    const withdraw = vi.fn();
    expect((await runIngestCli(["withdraw", "d1"], { paths, confirm: async () => false, draftActions: { withdraw } })).exitCode).toBe(2);
    expect(withdraw).not.toHaveBeenCalled();
    expect((await runIngestCli(["withdraw", "d1", "--yes"], { paths, draftActions: { withdraw } })).exitCode).toBe(0);
    expect(withdraw).toHaveBeenCalledWith("d1");
  });
});
