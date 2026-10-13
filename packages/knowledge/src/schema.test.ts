import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { migrateKnowledgeDocument } from "./migrations.js";
import { parsePublicKnowledge } from "./schema.js";

const validItem = {
  schemaVersion: 1,
  id: "isb-calendar-2026-10-13",
  title: "School calendar",
  content: "The official school calendar is available online.",
  language: "en",
  category: "calendar",
  tags: ["calendar"],
  sourceId: "isb-public-site",
  sourceUrl: "https://www.isb.cn/calendar",
  sourceType: "official-web",
  publishedAt: "2026-10-13T00:00:00.000Z",
  validFrom: "2026-10-13T00:00:00.000Z",
  validUntil: "2027-06-30T23:59:59.000Z",
  crawledAt: "2026-10-13T08:00:00.000Z",
  contentHash: "a".repeat(64),
  upstreamVersion: "2026-10-13",
  visibility: "public",
  reviewStatus: "approved",
  confidence: 1,
  warnings: []
} as const;

describe("public knowledge schema", () => {
  test("accepts_a_complete_public_item", () => {
    expect(parsePublicKnowledge([validItem])).toEqual([validItem]);
  });

  test.each([
    { visibility: "admin-only" },
    { visibility: "blocked" },
    { reviewStatus: "draft" },
    { reviewStatus: "expired" },
    { reviewStatus: "withdrawn" }
  ])("rejects_private_or_unreviewed_items %#", (override) => {
    expect(() => parsePublicKnowledge([{ ...validItem, ...override }])).toThrow();
  });

  test.each([
    { sourceUrl: "http://www.isb.cn/calendar" },
    { sourceUrl: "not-a-url" },
    { crawledAt: "yesterday" },
    { validUntil: "2026-99-99" }
  ])("rejects_invalid_dates_and_urls %#", (override) => {
    expect(() => parsePublicKnowledge([{ ...validItem, ...override }])).toThrow();
  });

  test("requires_schema_version_1", () => {
    expect(() => parsePublicKnowledge([{ ...validItem, schemaVersion: 0 }])).toThrow();
  });

  test("rejects_unknown_future_schema_versions", () => {
    expect(() =>
      migrateKnowledgeDocument({
        schemaVersion: 2,
        items: [validItem],
        manifest: {
          schemaVersion: 2,
          indexVersion: "future",
          generatedAt: "2026-10-13T08:00:00.000Z",
          itemCount: 1,
          sourceFreshness: []
        }
      })
    ).toThrow(/unsupported schema version/i);
  });

  test("migration_registry_accepts_v1_documents", () => {
    const document = {
      schemaVersion: 1,
      items: [validItem],
      manifest: {
        schemaVersion: 1,
        indexVersion: "seed-v1",
        generatedAt: "2026-10-13T08:00:00.000Z",
        itemCount: 1,
        sourceFreshness: [
          {
            sourceId: "isb-public-site",
            lastSuccessfulAt: "2026-10-13T08:00:00.000Z",
            status: "current"
          }
        ]
      }
    } as const;

    expect(migrateKnowledgeDocument(document)).toEqual(document);
  });

  test("published_seed_items_have_content_hashes_that_match_their_content", async () => {
    const file = await readFile(
      new URL("../../../data/knowledge/items.json", import.meta.url),
      "utf8"
    );
    const items = parsePublicKnowledge(JSON.parse(file));

    for (const item of items) {
      const expected = createHash("sha256").update(item.content).digest("hex");
      expect(item.contentHash).toBe(expected);
    }
  });
});
