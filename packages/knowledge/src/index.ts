import MiniSearch from "minisearch";

import {
  classifyFreshness,
  normalizeQuery,
  tokenizeText,
  type RetrievalOptions,
  type RetrievalResult,
  type RetrieveFn
} from "./retrieval.js";
import type { KnowledgeItem } from "./schema.js";

export interface SerializedSearchIndex {
  schemaVersion: 1;
  items: KnowledgeItem[];
  miniSearch: Record<string, unknown>;
}

function miniSearchOptions() {
  return {
    fields: ["title", "content", "category", "tags"],
    idField: "id",
    tokenize: tokenizeText,
    extractField: (document: KnowledgeItem, fieldName: string): string => {
      const value = document[fieldName as keyof KnowledgeItem];
      return Array.isArray(value) ? value.join(" ") : String(value ?? "");
    }
  };
}

function isPublishable(item: KnowledgeItem): boolean {
  const candidate = item as KnowledgeItem & { visibility?: string; reviewStatus?: string };
  return (
    candidate.visibility === "public" &&
    (candidate.reviewStatus === "approved" || candidate.reviewStatus === "auto-published")
  );
}

const CHINESE_SEARCH_EXPANSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/课后活动|课外活动|活动|俱乐部/u, "after school activities clubs"],
  [/报名|注册/u, "registration register"]
];

function expandCrossLanguageQuery(query: string, language: RetrievalOptions["language"]): string {
  if (language !== "zh") {
    return query;
  }

  const expansions = CHINESE_SEARCH_EXPANSIONS.flatMap(([pattern, terms]) =>
    pattern.test(query) ? [terms] : []
  );
  return expansions.length > 0 ? `${query} ${expansions.join(" ")}` : query;
}

export function buildSearchIndex(items: KnowledgeItem[]): SerializedSearchIndex {
  const publicItems = items
    .filter(isPublishable)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const miniSearch = new MiniSearch<KnowledgeItem>(miniSearchOptions());
  miniSearch.addAll(publicItems);

  return {
    schemaVersion: 1,
    items: publicItems,
    miniSearch: miniSearch.toJSON() as Record<string, unknown>
  };
}

export function createRetriever(serialized: SerializedSearchIndex): RetrieveFn {
  const miniSearch = MiniSearch.loadJSON<KnowledgeItem>(
    JSON.stringify(serialized.miniSearch),
    miniSearchOptions()
  );
  const itemsById = new Map(serialized.items.map((item) => [item.id, item]));

  return (query: string, options: RetrievalOptions): RetrievalResult[] => {
    const normalized = normalizeQuery(query);
    if (!normalized || options.limit <= 0) {
      return [];
    }

    const expanded = expandCrossLanguageQuery(normalized, options.language);

    return miniSearch
      .search(expanded, { prefix: true, fuzzy: 0.2 })
      .flatMap((result) => {
        const item = itemsById.get(String(result.id));
        if (!item || (options.category && item.category !== options.category)) {
          return [];
        }
        return [{ item, score: result.score, freshness: classifyFreshness(item, options.now) }];
      })
      .sort((left, right) => {
        const leftLanguageMatch = left.item.language === options.language ? 1 : 0;
        const rightLanguageMatch = right.item.language === options.language ? 1 : 0;
        return (
          rightLanguageMatch - leftLanguageMatch ||
          right.score - left.score ||
          left.item.id.localeCompare(right.item.id)
        );
      })
      .slice(0, Math.min(options.limit, 20));
  };
}

let defaultRetriever: RetrieveFn | undefined;

export function configureDefaultRetriever(serialized: SerializedSearchIndex): void {
  defaultRetriever = createRetriever(serialized);
}

export function retrieve(query: string, options: RetrievalOptions): RetrievalResult[] {
  if (!defaultRetriever) {
    throw new Error("Default knowledge retriever is not configured");
  }
  return defaultRetriever(query, options);
}
