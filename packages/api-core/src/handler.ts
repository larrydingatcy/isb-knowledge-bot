import type { AnswerResult } from "../../answering/src/types.js";
import { ZodError } from "zod";

import { corsHeaders, isOriginAllowed, type CorsOptions } from "./cors.js";
import type { AbuseGuard } from "./rate-limit.js";
import { parseChatRequest, type ChatRequest } from "./request.js";

export interface ChatHandlerDependencies extends CorsOptions {
  abuseGuard: AbuseGuard;
  answer(input: ChatRequest & { now: Date }): Promise<AnswerResult>;
  now: () => Date;
  timeoutMs: number;
}

class UpstreamTimeoutError extends Error {}

function json(body: unknown, status: number, headers = new Headers()): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new UpstreamTimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([operation, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createChatHandler(
  dependencies: ChatHandlerDependencies
): (request: Request) => Promise<Response> {
  const corsOptions: CorsOptions = dependencies;

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (!isOriginAllowed(origin, corsOptions)) {
      return json({ error: "origin_forbidden" }, 403);
    }
    const headers = corsHeaders(origin, corsOptions);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    let input: ChatRequest;
    try {
      input = await parseChatRequest(request);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return json({ error: "invalid_request" }, 400, headers);
      }
      return json({ error: "invalid_request" }, 400, headers);
    }

    try {
      const rate = await dependencies.abuseGuard.checkIp(requestIp(request));
      if (!rate.allowed) {
        return json({ error: "rate_limited" }, 429, headers);
      }
      const budget = await dependencies.abuseGuard.claimMonthlyBudget(dependencies.now());
      if (!budget.allowed) {
        return json({ error: "budget_exhausted" }, 503, headers);
      }
    } catch {
      return json({ error: "service_unavailable" }, 503, headers);
    }

    try {
      const answerInput = input.category
        ? { ...input, category: input.category, now: dependencies.now() }
        : { question: input.question, language: input.language, now: dependencies.now() };
      const answer = await withTimeout(dependencies.answer(answerInput), dependencies.timeoutMs);
      return json(answer, 200, headers);
    } catch (error) {
      if (error instanceof UpstreamTimeoutError) {
        return json({ error: "upstream_timeout" }, 504, headers);
      }
      return json({ error: "internal_error" }, 500, headers);
    }
  };
}
