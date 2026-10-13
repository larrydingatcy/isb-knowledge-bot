import type { AnswerResult } from "@isb/answering/types";
import type { KnowledgeItem, KnowledgeManifest } from "@isb/knowledge/schema";

import type { Category, Language } from "./i18n.js";

export interface ChatRequest {
  question: string;
  language: Language;
  category?: Category;
}

export async function requestAnswer(input: ChatRequest): Promise<AnswerResult> {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const response = await fetch(new URL("/api/v1/chat", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);
  return response.json() as Promise<AnswerResult>;
}

export async function loadKnowledge(): Promise<{
  items: KnowledgeItem[];
  manifest: KnowledgeManifest;
}> {
  const base = import.meta.env.BASE_URL;
  const [itemsResponse, manifestResponse] = await Promise.all([
    fetch(`${base}knowledge/items.json`),
    fetch(`${base}knowledge/manifest.json`)
  ]);
  if (!itemsResponse.ok || !manifestResponse.ok) throw new Error("Knowledge files unavailable");
  return {
    items: (await itemsResponse.json()) as KnowledgeItem[],
    manifest: (await manifestResponse.json()) as KnowledgeManifest
  };
}
