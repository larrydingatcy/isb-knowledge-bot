import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildSearchIndex } from "@isb/knowledge/index";
import { KnowledgeManifestSchema, parsePublicKnowledge, type KnowledgeItem, type KnowledgeManifest } from "@isb/knowledge/schema";
import type { RawDocument } from "../adapters/types.js";
import { deduplicateItems, tagConflicts } from "./deduplicate.js";
import { normalizeText, sha256 } from "./normalize.js";
import { findPii } from "./pii.js";
import { assertDocumentQuality } from "./quality.js";

export interface ReleaseDocument { sourceId: string; category: string; document: RawDocument }
export interface ReleaseInput {
  documents: ReleaseDocument[];
  existingItems: KnowledgeItem[];
  manifest: KnowledgeManifest;
  now: Date;
  sourceFailures?: Array<{ sourceId: string; error: string }>;
}
export interface BlockedItem { sourceId: string; canonicalUrl: string; reasons: string[] }
export interface ReleaseCandidate {
  publicItems: KnowledgeItem[];
  blockedItems: BlockedItem[];
  conflicts: Array<{ key: string; itemIds: string[] }>;
  warnings: string[];
  contentHashes: string[];
  nextManifest: KnowledgeManifest;
  status: { generatedAt: string; blockedCount: number; conflictCount: number; failures: Array<{ sourceId: string; error: string }> };
}

function toKnowledge(entry: ReleaseDocument, now: Date): KnowledgeItem {
  const title = normalizeText(entry.document.title);
  const content = normalizeText(entry.document.text);
  const contentHash = sha256(content);
  const date = entry.document.publishedAt ?? entry.document.fetchedAt;
  const identity = sha256(`${entry.sourceId}\n${title}\n${contentHash}`).slice(0, 24);
  const validUntil = new Date(now);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
  return {
    schemaVersion: 1,
    id: `${entry.sourceId}-${identity}`,
    title,
    content,
    language: entry.document.language,
    category: entry.category,
    tags: [entry.category, entry.sourceId],
    sourceId: entry.sourceId,
    sourceUrl: entry.document.canonicalUrl,
    sourceType: "official-web",
    publishedAt: new Date(date).toISOString(),
    validFrom: now.toISOString(),
    validUntil: validUntil.toISOString(),
    crawledAt: new Date(entry.document.fetchedAt).toISOString(),
    contentHash,
    upstreamVersion: contentHash.slice(0, 16),
    visibility: "public",
    reviewStatus: "auto-published",
    confidence: 0.9,
    warnings: []
  };
}

export function prepareRelease(input: ReleaseInput): ReleaseCandidate {
  const failures = input.sourceFailures ?? [];
  const failed = new Set(failures.map((failure) => failure.sourceId));
  const successful = new Set(input.documents.map((entry) => entry.sourceId));
  const blockedItems: BlockedItem[] = [];
  const fresh: KnowledgeItem[] = [];

  for (const entry of input.documents) {
    assertDocumentQuality(entry.document);
    const findings = findPii(`${entry.document.title}\n${entry.document.text}`);
    if (findings.length) {
      blockedItems.push({ sourceId: entry.sourceId, canonicalUrl: entry.document.canonicalUrl, reasons: findings.map((finding) => finding.kind) });
      continue;
    }
    fresh.push(toKnowledge(entry, input.now));
  }

  const preserved = input.existingItems.filter((item) => failed.has(item.sourceId) || !successful.has(item.sourceId));
  const deduplicated = deduplicateItems([...preserved, ...fresh]);
  const tagged = tagConflicts(deduplicated);
  const priorFreshness = new Map(input.manifest.sourceFreshness.map((value) => [value.sourceId, value]));
  for (const sourceId of successful) priorFreshness.set(sourceId, { sourceId, lastSuccessfulAt: input.now.toISOString(), status: "current" });
  for (const failure of failures) {
    const old = priorFreshness.get(failure.sourceId);
    priorFreshness.set(failure.sourceId, { sourceId: failure.sourceId, lastSuccessfulAt: old?.lastSuccessfulAt ?? input.now.toISOString(), status: "failed" });
  }
  const indexVersion = sha256(tagged.items.map((item) => item.contentHash).join("\n")).slice(0, 16);
  const nextManifest: KnowledgeManifest = {
    schemaVersion: 1, indexVersion, generatedAt: input.now.toISOString(), itemCount: tagged.items.length,
    sourceFreshness: [...priorFreshness.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
  };
  return {
    publicItems: tagged.items,
    blockedItems,
    conflicts: tagged.conflicts,
    warnings: failures.map((failure) => `${failure.sourceId}: ${failure.error}`),
    contentHashes: tagged.items.map((item) => item.contentHash),
    nextManifest,
    status: { generatedAt: input.now.toISOString(), blockedCount: blockedItems.length, conflictCount: tagged.conflicts.length, failures }
  };
}

export interface PublishSummary { itemCount: number; indexVersion: string }
export async function publishRelease(candidate: ReleaseCandidate, targetDir: string, hooks: { beforeSwap?: () => Promise<void> } = {}): Promise<PublishSummary> {
  const items = parsePublicKnowledge(candidate.publicItems);
  const manifest = KnowledgeManifestSchema.parse(candidate.nextManifest);
  const parent = dirname(targetDir);
  const temporary = join(parent, `.${basename(targetDir)}-${randomUUID()}.tmp`);
  const backup = join(parent, `.${basename(targetDir)}-${randomUUID()}.bak`);
  await mkdir(temporary, { recursive: true });
  try {
    await Promise.all([
      writeFile(join(temporary, "items.json"), `${JSON.stringify(items, null, 2)}\n`),
      writeFile(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
      writeFile(join(temporary, "status.json"), `${JSON.stringify(candidate.status, null, 2)}\n`),
      writeFile(join(temporary, "search-index.json"), `${JSON.stringify(buildSearchIndex(items), null, 2)}\n`)
    ]);
    parsePublicKnowledge(JSON.parse(await readFile(join(temporary, "items.json"), "utf8")));
    await hooks.beforeSwap?.();
    let backedUp = false;
    try {
      await rename(targetDir, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(temporary, targetDir);
      if (backedUp) await rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (backedUp) await rename(backup, targetDir);
      throw error;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { itemCount: items.length, indexVersion: manifest.indexVersion };
}
