import type { SourceDefinition } from "../config/schema.js";

export interface FetchResponse {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}

export type FetchClient = (url: URL) => Promise<FetchResponse>;

export interface RawDocument {
  canonicalUrl: string;
  title: string;
  language: "en" | "zh";
  html?: string;
  text: string;
  publishedAt?: string;
  fetchedAt: string;
  attachments: string[];
}

export interface AdapterContext {
  source: SourceDefinition;
  fetch: FetchClient;
  delay: (milliseconds: number) => Promise<void>;
  canFetch: (url: URL) => Promise<boolean>;
  now: () => Date;
}

export interface SourceAdapter {
  collect(context: AdapterContext): AsyncIterable<RawDocument>;
}
