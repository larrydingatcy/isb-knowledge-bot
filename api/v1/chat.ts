import type { VercelRequest, VercelResponse } from "@vercel/node";

import { answerQuestion } from "@isb/answering";
import { createOpenAIModelClient } from "@isb/answering/model";
import { createChatHandler } from "@isb/api-core";
import { createUpstashAbuseGuard } from "@isb/api-core/rate-limit";
import { createRetriever, type SerializedSearchIndex } from "@isb/knowledge/index";

import searchIndex from "../../data/knowledge/search-index.json" with { type: "json" };

function toRequest(request: VercelRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  const host = request.headers.host ?? "localhost";
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body);
  const init: RequestInit = {
    method: request.method ?? "POST",
    headers
  };
  if (body !== undefined) init.body = body;
  return new Request(`https://${host}${request.url ?? "/api/v1/chat"}`, init);
}

async function send(response: Response, target: VercelResponse): Promise<void> {
  target.status(response.status);
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.send(await response.text());
}

let chatHandler: ReturnType<typeof createChatHandler> | undefined;

function getHandler(): ReturnType<typeof createChatHandler> {
  if (chatHandler) return chatHandler;
  const retriever = createRetriever(searchIndex as SerializedSearchIndex);
  const model = createOpenAIModelClient();
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  chatHandler = createChatHandler({
    allowedOrigins,
    environment: process.env.VERCEL_ENV === "production" ? "production" : "development",
    abuseGuard: createUpstashAbuseGuard(),
    answer: (input) =>
      answerQuestion(
        input.category
          ? { ...input, category: input.category }
          : { question: input.question, language: input.language, now: input.now },
        { retrieve: retriever, model }
      ),
    now: () => new Date(),
    timeoutMs: 18_000
  });
  return chatHandler;
}

export default async function chat(request: VercelRequest, response: VercelResponse): Promise<void> {
  await send(await getHandler()(toRequest(request)), response);
}
