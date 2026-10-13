import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KnowledgeItem, KnowledgeManifest } from "@isb/knowledge/schema";
import type { RawDocument } from "../adapters/types.js";
import { normalizeText } from "./normalize.js";
import { prepareRelease, publishRelease } from "./release.js";

const now = new Date("2026-10-13T00:00:00Z");
const manifest: KnowledgeManifest = { schemaVersion: 1, indexVersion: "old", generatedAt: now.toISOString(), itemCount: 0, sourceFreshness: [] };
const raw = (overrides: Partial<RawDocument> = {}): RawDocument => ({
  canonicalUrl: "https://www.isb.cn/event", title: "Family Event", language: "en",
  text: "Families are invited to the school community event on November 9, 2026.",
  fetchedAt: now.toISOString(), publishedAt: "2026-10-01T00:00:00Z", attachments: [], ...overrides
});
const input = (documents: RawDocument[]) => ({
  documents: documents.map((document) => ({ sourceId: "isb", category: "calendar", document })),
  existingItems: [] as KnowledgeItem[], manifest, now
});

describe("release preparation", () => {
  it("normalizes Unicode and produces deterministic IDs and hashes", () => {
    expect(normalizeText("Ａ  B\n C")).toBe("A B C");
    const first = prepareRelease(input([raw()]));
    const second = prepareRelease(input([raw()]));
    expect(first.publicItems[0]?.id).toBe(second.publicItems[0]?.id);
    expect(first.contentHashes).toEqual(second.contentHashes);
  });

  it("merges duplicate content", () => {
    const candidate = prepareRelease(input([raw(), raw({ canonicalUrl: "https://www.isb.cn/event-copy" })]));
    expect(candidate.publicItems).toHaveLength(1);
  });

  it("retains conflicting deadlines and tags both entries", () => {
    const candidate = prepareRelease(input([
      raw({ text: "Family Event registration closes November 9, 2026." }),
      raw({ canonicalUrl: "https://www.isb.cn/other", text: "Family Event registration closes November 12, 2026." })
    ]));
    expect(candidate.publicItems).toHaveLength(2);
    expect(candidate.conflicts).toHaveLength(1);
    expect(candidate.publicItems.every((item) => item.warnings.includes("conflicting-source-facts"))).toBe(true);
  });

  it.each([
    "Contact student@example.com about the family event.",
    "Student ID: 123456 and event details.",
    "Account balance: RMB 500 for this family."
  ])("blocks PII from public output: %s", (text) => {
    const candidate = prepareRelease(input([raw({ text })]));
    expect(candidate.publicItems).toHaveLength(0);
    expect(candidate.blockedItems).toHaveLength(1);
  });

  it("keeps the last known good item when every replacement is PII-blocked", () => {
    const old = prepareRelease(input([raw()])).publicItems[0]!;
    const candidate = prepareRelease({ ...input([raw({ text: "Contact parent@example.com about this notice." })]), existingItems: [old] });
    expect(candidate.blockedItems).toHaveLength(1);
    expect(candidate.publicItems).toEqual([old]);
  });

  it.each(["", "Sign in Username Password Forgot password"]) ("rejects empty or login-shell output", (text) => {
    expect(() => prepareRelease(input([raw({ text })]))).toThrow(/quality/i);
  });

  it("preserves existing items for a failed source", () => {
    const old = prepareRelease(input([raw()])).publicItems[0]!;
    const candidate = prepareRelease({ ...input([]), existingItems: [old], sourceFailures: [{ sourceId: "isb", error: "timeout" }] });
    expect(candidate.publicItems).toEqual([old]);
    expect(candidate.nextManifest.sourceFreshness[0]?.status).toBe("failed");
  });
});

describe("atomic publication", () => {
  it("writes validated items, manifest, status, and search index", async () => {
    const root = await mkdtemp(join(tmpdir(), "isb-release-"));
    const target = join(root, "knowledge");
    await mkdir(target);
    const summary = await publishRelease(prepareRelease(input([raw()])), target);
    expect(summary.itemCount).toBe(1);
    expect(JSON.parse(await readFile(join(target, "items.json"), "utf8"))).toHaveLength(1);
    expect(JSON.parse(await readFile(join(target, "search-index.json"), "utf8"))).toBeTruthy();
  });

  it("leaves the prior release byte-identical when the atomic swap fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "isb-release-"));
    const target = join(root, "knowledge");
    await mkdir(target);
    await writeFile(join(target, "items.json"), "OLD ITEMS\n");
    await writeFile(join(target, "manifest.json"), "OLD MANIFEST\n");
    const before = await Promise.all([readFile(join(target, "items.json"), "utf8"), readFile(join(target, "manifest.json"), "utf8")]);
    await expect(publishRelease(prepareRelease(input([raw()])), target, { beforeSwap: async () => { throw new Error("disk failure"); } })).rejects.toThrow("disk failure");
    const after = await Promise.all([readFile(join(target, "items.json"), "utf8"), readFile(join(target, "manifest.json"), "utf8")]);
    expect(after).toEqual(before);
  });
});
