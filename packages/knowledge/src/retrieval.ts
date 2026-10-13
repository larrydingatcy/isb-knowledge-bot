import type { KnowledgeItem } from "./schema.js";

export type Freshness = "current" | "stale" | "expired";

export interface RetrievalOptions {
  language: "zh" | "en";
  category?: string;
  limit: number;
  now: Date;
}

export interface RetrievalResult {
  item: KnowledgeItem;
  score: number;
  freshness: Freshness;
}

export type RetrieveFn = (query: string, options: RetrievalOptions) => RetrievalResult[];

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export function classifyFreshness(item: KnowledgeItem, now: Date): Freshness {
  if (now.getTime() > new Date(item.validUntil).getTime()) {
    return "expired";
  }

  if (now.getTime() - new Date(item.crawledAt).getTime() > STALE_AFTER_MS) {
    return "stale";
  }

  return "current";
}

export function normalizeQuery(query: string): string {
  return Array.from(query.normalize("NFKC").trim()).slice(0, 500).join("");
}

export function tokenizeText(value: string): string[] {
  const matches = value.normalize("NFKC").toLocaleLowerCase().match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu);
  return matches ? [...new Set(matches)] : [];
}
