import type { Freshness } from "@isb/knowledge/retrieval";

export interface GroundedEvidence {
  citationId: string;
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  crawledAt: string;
  freshness: Freshness;
}

export interface GroundedModelInput {
  language: "zh" | "en";
  question: string;
  evidence: GroundedEvidence[];
}

export interface GroundedModelOutput {
  status: "answered" | "unknown" | "conflict";
  answer: string;
  citationIds: string[];
}

export interface ModelClient {
  generate(input: GroundedModelInput): Promise<GroundedModelOutput>;
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  crawledAt: string;
  freshness: Freshness;
}

export type AnswerResult =
  | {
      status: "answered";
      answer: string;
      citations: Citation[];
      freshness: Freshness;
    }
  | {
      status: "unknown" | "conflict";
      answer: string;
      citations: Citation[];
    };
