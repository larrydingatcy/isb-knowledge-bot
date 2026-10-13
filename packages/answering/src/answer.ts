import type {
  Freshness,
  RetrievalOptions,
  RetrievalResult,
  RetrieveFn
} from "@isb/knowledge/retrieval";

import type {
  AnswerResult,
  Citation,
  GroundedEvidence,
  ModelClient
} from "./types.js";

export interface AnswerQuestionInput {
  question: string;
  language: "zh" | "en";
  category?: string;
  now: Date;
}

export interface AnswerQuestionDependencies {
  retrieve: RetrieveFn;
  model: ModelClient;
}

const unknownMessages = {
  zh: "未找到足够可靠的官方资料。请查看引用的学校官方入口或向学校确认。",
  en: "I could not find enough reliable official information. Please check the official school source or confirm with the school."
} as const;

function unknown(language: "zh" | "en"): AnswerResult {
  return { status: "unknown", answer: unknownMessages[language], citations: [] };
}

function retrievalOptions(input: AnswerQuestionInput): RetrievalOptions {
  const base = { language: input.language, limit: 8, now: input.now };
  return input.category ? { ...base, category: input.category } : base;
}

function evidenceFrom(results: RetrievalResult[]): GroundedEvidence[] {
  return results.map(({ item, freshness }) => ({
    citationId: item.id,
    title: item.title,
    content: item.content,
    url: item.sourceUrl,
    publishedAt: item.publishedAt,
    crawledAt: item.crawledAt,
    freshness
  }));
}

function citationFrom(result: RetrievalResult): Citation {
  return {
    id: result.item.id,
    title: result.item.title,
    url: result.item.sourceUrl,
    publishedAt: result.item.publishedAt,
    crawledAt: result.item.crawledAt,
    freshness: result.freshness
  };
}

function worstFreshness(citations: Citation[]): Freshness {
  if (citations.some((citation) => citation.freshness === "expired")) return "expired";
  if (citations.some((citation) => citation.freshness === "stale")) return "stale";
  return "current";
}

export async function answerQuestion(
  input: AnswerQuestionInput,
  dependencies: AnswerQuestionDependencies
): Promise<AnswerResult> {
  const results = dependencies.retrieve(input.question, retrievalOptions(input));
  if (results.length === 0) {
    return unknown(input.language);
  }

  const output = await dependencies.model.generate({
    language: input.language,
    question: input.question,
    evidence: evidenceFrom(results)
  });
  if (output.status === "unknown") {
    return unknown(input.language);
  }

  const resultsById = new Map(results.map((result) => [result.item.id, result]));
  const uniqueIds = [...new Set(output.citationIds)];
  if (uniqueIds.length === 0 || uniqueIds.some((id) => !resultsById.has(id))) {
    return unknown(input.language);
  }

  const citations = uniqueIds.map((id) => citationFrom(resultsById.get(id)!));
  if (output.status === "conflict") {
    return { status: "conflict", answer: output.answer, citations };
  }

  return {
    status: "answered",
    answer: output.answer,
    citations,
    freshness: worstFreshness(citations)
  };
}
