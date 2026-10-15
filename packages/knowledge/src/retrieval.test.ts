import { describe, expect, test } from "vitest";

import type { KnowledgeItem } from "./schema.js";
import { buildSearchIndex, createRetriever } from "./index.js";
import { classifyFreshness } from "./retrieval.js";

const now = new Date("2026-10-13T12:00:00.000Z");

function item(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    schemaVersion: 1,
    id: "asa-registration",
    title: "After-school activity registration",
    content: "Registration for after-school activities opens in November.",
    language: "en",
    category: "activities",
    tags: ["ASA", "registration"],
    sourceId: "isb-public-site",
    sourceUrl: "https://www.isb.cn/activities",
    sourceType: "official-web",
    publishedAt: "2026-10-01T00:00:00.000Z",
    validFrom: "2026-10-01T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.000Z",
    crawledAt: "2026-10-13T08:00:00.000Z",
    contentHash: "a".repeat(64),
    upstreamVersion: "2026-10-01",
    visibility: "public",
    reviewStatus: "approved",
    confidence: 1,
    warnings: [],
    ...overrides
  };
}

function retriever(items: KnowledgeItem[]) {
  return createRetriever(buildSearchIndex(items));
}

describe("knowledge retrieval", () => {
  test("matches_chinese_terms_without_spaces", () => {
    const search = retriever([
      item({
        id: "asa-zh",
        title: "课后活动报名",
        content: "课后活动报名将在十一月开放。",
        language: "zh"
      })
    ]);

    expect(search("课后活动", { language: "zh", limit: 5, now })[0]?.item.id).toBe("asa-zh");
  });

  test("matches_english_terms_case_insensitively", () => {
    const search = retriever([item()]);

    expect(search("AFTER SCHOOL REGISTRATION", { language: "en", limit: 5, now })[0]?.item.id).toBe(
      "asa-registration"
    );
  });

  test("falls_back_to_english_official_sources_for_chinese_queries", () => {
    const search = retriever([item()]);

    expect(
      search("学生什么时候报名课后活动？", {
        language: "zh",
        category: "activities",
        limit: 5,
        now
      })[0]?.item.id
    ).toBe("asa-registration");
  });

  test("prefers_sources_in_the_requested_language", () => {
    const search = retriever([
      item(),
      item({
        id: "asa-zh",
        title: "课后活动报名",
        content: "学生在学年开始时报名课后活动。",
        language: "zh"
      })
    ]);

    expect(
      search("课后活动 after-school activities", { language: "zh", limit: 5, now }).map(
        (result) => result.item.id
      )
    ).toEqual(["asa-zh", "asa-registration"]);
  });

  test("filters_by_category", () => {
    const search = retriever([
      item(),
      item({ id: "bus", title: "Bus service", content: "Bus routes", category: "transport" })
    ]);

    expect(
      search("service registration", {
        language: "en",
        category: "transport",
        limit: 5,
        now
      }).map((result) => result.item.id)
    ).toEqual(["bus"]);
  });

  test("orders_equal_scores_by_stable_item_id", () => {
    const search = retriever([
      item({ id: "z-item", title: "Calendar", content: "School calendar" }),
      item({ id: "a-item", title: "Calendar", content: "School calendar" })
    ]);

    expect(search("calendar", { language: "en", limit: 5, now }).map((result) => result.item.id)).toEqual([
      "a-item",
      "z-item"
    ]);
  });

  test("classifies_current_stale_and_expired_items", () => {
    expect(classifyFreshness(item(), now)).toBe("current");
    expect(
      classifyFreshness(item({ crawledAt: "2026-10-10T08:00:00.000Z" }), now)
    ).toBe("stale");
    expect(
      classifyFreshness(item({ validUntil: "2026-10-12T23:59:59.000Z" }), now)
    ).toBe("expired");
  });

  test("returns_no_results_for_an_empty_query", () => {
    expect(retriever([item()])("   ", { language: "en", limit: 5, now })).toEqual([]);
  });

  test("accepts_a_500_character_unicode_query", () => {
    const search = retriever([
      item({ id: "long-zh", title: "活动", content: "活动安排", language: "zh" })
    ]);

    expect(() => search("活".repeat(500), { language: "zh", limit: 5, now })).not.toThrow();
  });

  test("never_indexes_non_public_or_unreviewed_runtime_values", () => {
    const invalid = [
      item({ id: "private" }),
      { ...item({ id: "admin" }), visibility: "admin-only" },
      { ...item({ id: "draft" }), reviewStatus: "draft" }
    ] as KnowledgeItem[];
    const search = retriever(invalid);

    expect(search("registration", { language: "en", limit: 10, now }).map((result) => result.item.id)).toEqual([
      "private"
    ]);
  });
});
