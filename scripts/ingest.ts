import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { loadSources } from "../packages/ingestion/src/config/load.js";
import { assertSafeSourceUrl } from "../packages/ingestion/src/config/safe-url.js";
import type { SourceDefinition } from "../packages/ingestion/src/config/schema.js";
import { createAdapter } from "../packages/ingestion/src/adapters/registry.js";
import type { RawDocument } from "../packages/ingestion/src/adapters/types.js";
import { ingestFile } from "../packages/ingestion/src/adapters/files.js";
import { DraftStore } from "../packages/ingestion/src/admin/drafts.js";
import { prepareRelease, publishRelease, type ReleaseDocument } from "../packages/ingestion/src/pipeline/release.js";
import { KnowledgeManifestSchema, parsePublicKnowledge, type KnowledgeManifest } from "@isb/knowledge/schema";

const require = createRequire(import.meta.url);
const robotsParser = require("robots-parser") as (url: string, contents: string) => { isAllowed(url: string, userAgent?: string): boolean | undefined };

export interface IngestPaths { config: string; drafts: string; knowledge: string }
interface CliResult { exitCode: number; output: string; json?: string }
interface DraftActions {
  preview?: (id: string) => Promise<unknown>;
  approve?: (id: string, options?: { redactionAcknowledged?: boolean; redactedText?: string }) => Promise<unknown>;
  withdraw?: (id: string) => Promise<unknown>;
  list?: () => Promise<Array<{ id: string; state: string }>>;
}
interface CliDeps {
  paths: IngestPaths;
  crawl?: (sources: SourceDefinition[]) => Promise<unknown>;
  publish?: (drafts: Array<{ id: string; state: string }>) => Promise<unknown>;
  draftActions?: DraftActions;
  confirm?: (message: string) => Promise<boolean>;
}

const help = `Usage:
  pnpm ingest crawl [source-id] [--dry-run]
  pnpm ingest source validate
  pnpm ingest upload <path>
  pnpm ingest draft preview <id>
  pnpm ingest draft approve <id>
  pnpm ingest publish
  pnpm ingest withdraw <id> [--yes]`;

const jsonResult = (exitCode: number, value: object, output = ""): CliResult => ({ exitCode, output: output || JSON.stringify(value), json: JSON.stringify(value) });

async function resolveDns(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

async function guardedFetch(url: URL, source: SourceDefinition) {
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertSafeSourceUrl(current, source, resolveDns);
    const response = await fetch(current, { redirect: "manual", headers: { "user-agent": "ISB-Knowledge-Bot/1.0 (+https://github.com/larrydingatcy/isb-knowledge-bot)" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect without Location from ${current.href}`);
      current = new URL(location, current);
      continue;
    }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { url: response.url || current.href, status: response.status, headers, body: await response.text() };
  }
  throw new Error(`Too many redirects from ${url.href}`);
}

export async function crawlPublicSources(sources: SourceDefinition[]): Promise<Array<{ sourceId: string; document: RawDocument }>> {
  const collected: Array<{ sourceId: string; document: RawDocument }> = [];
  for (const source of sources) {
    const adapter = createAdapter(source.adapter);
    const robotsUrl = new URL("/robots.txt", source.baseUrl);
    const robotsResponse = await guardedFetch(robotsUrl, source);
    const robots = robotsParser(robotsUrl.href, robotsResponse.status === 404 ? "" : robotsResponse.body);
    const canFetch = async (url: URL) => {
      await assertSafeSourceUrl(url, source, resolveDns);
      return robots.isAllowed(url.href, "ISB-Knowledge-Bot") !== false;
    };
    for await (const document of adapter.collect({
      source,
      fetch: (url) => guardedFetch(url, source),
      canFetch,
      delay: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
      now: () => new Date()
    })) collected.push({ sourceId: source.id, document });
  }
  return collected;
}

async function readJsonIfPresent(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function publishFromWorkspace(paths: IngestPaths, sources: SourceDefinition[], store: DraftStore) {
  const now = new Date();
  const existingRaw = await readJsonIfPresent(join(paths.knowledge, "items.json"));
  const manifestRaw = await readJsonIfPresent(join(paths.knowledge, "manifest.json"));
  const existingItems = existingRaw ? parsePublicKnowledge(existingRaw) : [];
  const manifest: KnowledgeManifest = manifestRaw ? KnowledgeManifestSchema.parse(manifestRaw) : {
    schemaVersion: 1, indexVersion: "empty", generatedAt: now.toISOString(), itemCount: 0, sourceFreshness: []
  };
  const crawlPath = join(paths.drafts, "crawl", "latest.json");
  const crawl = (await readJsonIfPresent(crawlPath) ?? []) as Array<{ sourceId: string; document: RawDocument }>;
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const releaseDocuments: ReleaseDocument[] = crawl.map((entry) => ({
    sourceId: entry.sourceId,
    category: sourceMap.get(entry.sourceId)?.categories[0] ?? "policies",
    sourceType: "official-web",
    reviewStatus: "auto-published",
    document: entry.document
  }));
  const approved = (await store.list()).filter((draft) => draft.state === "approved");
  for (const draft of approved) releaseDocuments.push({
    sourceId: `upload-${draft.id}`,
    category: draft.categories[0] ?? "forms",
    sourceType: "official-document",
    reviewStatus: "approved",
    document: {
      canonicalUrl: draft.sourceUrl ?? "https://www.isb.cn/",
      title: draft.sourceName,
      language: /[\u3400-\u9fff]/u.test(draft.text) ? "zh" : "en",
      text: draft.text,
      fetchedAt: draft.createdAt,
      attachments: []
    }
  });
  if (releaseDocuments.length === 0) throw new Error("No crawled or approved documents to publish");
  const candidate = prepareRelease({ documents: releaseDocuments, existingItems, manifest, now });
  const publicFingerprint = (items: typeof existingItems) => JSON.stringify(items.map((item) => ({
    id: item.id, title: item.title, content: item.content, language: item.language, category: item.category,
    tags: item.tags, sourceId: item.sourceId, sourceUrl: item.sourceUrl, sourceType: item.sourceType,
    contentHash: item.contentHash, reviewStatus: item.reviewStatus, warnings: item.warnings
  })).sort((left, right) => left.id.localeCompare(right.id)));
  if (approved.length === 0 && candidate.blockedItems.length === 0 && candidate.conflicts.length === 0 && publicFingerprint(candidate.publicItems) === publicFingerprint(existingItems)) {
    await rm(crawlPath, { force: true });
    return { itemCount: existingItems.length, indexVersion: manifest.indexVersion, blockedItems: 0, conflicts: 0, noChange: true };
  }
  const summary = await publishRelease(candidate, paths.knowledge);
  for (const draft of approved) await store.markPublished(draft.id);
  await rm(crawlPath, { force: true });
  return { ...summary, blockedItems: candidate.blockedItems.length, conflicts: candidate.conflicts.length };
}

export async function runIngestCli(args: string[], deps: CliDeps): Promise<CliResult> {
  try {
    if (args.length === 0 || args[0] === "--help" || args[0] === "help") return { exitCode: 0, output: help };
    const sources = await loadSources(deps.paths.config);
    const store = new DraftStore(deps.paths.drafts);
    const actions: DraftActions = {
      preview: (id) => store.preview(id), approve: (id, options) => store.approve(id, options),
      withdraw: (id) => store.withdraw(id), list: () => store.list(), ...deps.draftActions
    };
    if (args[0] === "source" && args[1] === "validate") return jsonResult(0, { valid: true, sources: sources.length });
    if (args[0] === "crawl") {
      const requested = args[1]?.startsWith("--") ? undefined : args[1];
      const selected = requested ? sources.filter((source) => source.id === requested) : sources;
      if (requested && selected.length === 0) return jsonResult(2, { ok: false, error: `Unknown source: ${requested}` });
      if (args.includes("--dry-run")) return jsonResult(0, { ok: true, dryRun: true, sourceIds: selected.map((source) => source.id) });
      const result = await (deps.crawl ?? crawlPublicSources)(selected);
      const crawlDir = resolve(deps.paths.drafts, "crawl");
      await mkdir(crawlDir, { recursive: true });
      await writeFile(resolve(crawlDir, "latest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      return jsonResult(0, { ok: true, dryRun: false, sourceIds: selected.map((source) => source.id) });
    }
    if (args[0] === "upload" && args[1]) {
      const draft = await ingestFile(resolve(args[1]), { sourceName: basename(args[1]), categories: ["forms"], visibility: "public" });
      await store.create(draft);
      return jsonResult(0, { ok: true, id: draft.id, state: draft.state });
    }
    if (args[0] === "draft" && args[1] === "preview" && args[2]) return jsonResult(0, { ok: true, draft: await actions.preview!(args[2]) });
    if (args[0] === "draft" && args[1] === "approve" && args[2]) return jsonResult(0, { ok: true, draft: await actions.approve!(args[2]) });
    if (args[0] === "publish") {
      const drafts = await actions.list!();
      const approved = drafts.filter((draft) => draft.state === "approved");
      if (approved.length === 0 && deps.publish) return jsonResult(2, { ok: false, error: "No approved drafts to publish" });
      const result = deps.publish ? await deps.publish(approved) : await publishFromWorkspace(deps.paths, sources, store);
      return jsonResult(0, { ok: true, published: approved.length, result });
    }
    if (args[0] === "withdraw" && args[1]) {
      const confirmed = args.includes("--yes") || await deps.confirm?.(`Withdraw ${args[1]}?`) === true;
      if (!confirmed) return jsonResult(2, { ok: false, error: "Withdrawal not confirmed" });
      await actions.withdraw!(args[1]);
      return jsonResult(0, { ok: true, withdrawn: args[1] });
    }
    return jsonResult(2, { ok: false, error: `Unknown command: ${args.join(" ")}` }, help);
  } catch (error) {
    return jsonResult(1, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const result = await runIngestCli(process.argv.slice(2), { paths: { config: resolve(root, "config/sources.yml"), drafts: resolve(root, "data/drafts"), knowledge: resolve(root, "data/knowledge") } });
  console.log(result.output);
  if (result.json && result.output !== result.json) console.log(result.json);
  process.exitCode = result.exitCode;
}
