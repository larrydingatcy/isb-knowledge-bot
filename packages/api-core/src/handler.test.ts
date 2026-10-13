import { describe, expect, test } from "vitest";

import type { AnswerResult } from "@isb/answering/types";

import { createChatHandler } from "./handler.js";
import type { AbuseGuard } from "./rate-limit.js";

const allowedOrigin = "https://larrydingatcy.github.io";

function guard(overrides: Partial<AbuseGuard> = {}): AbuseGuard {
  return {
    checkIp: async () => ({ allowed: true }),
    claimMonthlyBudget: async () => ({ allowed: true }),
    ...overrides
  };
}

function handler(options: {
  abuseGuard?: AbuseGuard;
  answer?: (input: {
    question: string;
    language: "zh" | "en";
    category?: string;
    now: Date;
  }) => Promise<AnswerResult>;
  timeoutMs?: number;
  environment?: "production" | "development";
}) {
  return createChatHandler({
    allowedOrigins: [allowedOrigin],
    environment: options.environment ?? "production",
    abuseGuard: options.abuseGuard ?? guard(),
    answer:
      options.answer ??
      (async (input) => ({
        status: "answered",
        answer: input.language === "zh" ? "有依据的中文回答" : "Grounded English answer",
        citations: [
          {
            id: "official",
            title: "Official source",
            url: "https://www.isb.cn/official",
            publishedAt: "2026-10-01T00:00:00.000Z",
            crawledAt: "2026-10-13T08:00:00.000Z",
            freshness: "current"
          }
        ],
        freshness: "current"
      })),
    now: () => new Date("2026-10-13T12:00:00.000Z"),
    timeoutMs: options.timeoutMs ?? 18_000
  });
}

function request(
  body: unknown,
  init: { origin?: string; method?: string; rawBody?: string; ip?: string } = {}
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("origin", init.origin ?? allowedOrigin);
  headers.set("x-forwarded-for", init.ip ?? "203.0.113.10");
  const requestInit: RequestInit = {
    method: init.method ?? "POST",
    headers
  };
  if ((init.method ?? "POST") !== "GET") {
    requestInit.body = init.rawBody ?? JSON.stringify(body);
  }
  return new Request("https://api.example.test/api/v1/chat", requestInit);
}

describe("chat API handler", () => {
  test.each([
    ["zh" as const, "有依据的中文回答"],
    ["en" as const, "Grounded English answer"]
  ])("returns_valid_%s_answers_with_cors", async (language, expected) => {
    const response = await handler({})(request({ question: "When?", language }));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(await response.json()).toMatchObject({ status: "answered", answer: expected });
  });

  test("rejects_malformed_json", async () => {
    const response = await handler({})(request({}, { rawBody: "{" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  test.each([
    [{ question: "When?" }, "missing language"],
    [{ question: "", language: "en" }, "empty question"],
    [{ question: "x".repeat(501), language: "en" }, "long question"]
  ])("rejects_invalid_request_%s", async (body, _caseName) => {
    const response = await handler({})(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  test("rejects_an_unsupported_cross_origin_caller_before_answering", async () => {
    let answered = false;
    const response = await handler({
      answer: async () => {
        answered = true;
        throw new Error("must not run");
      }
    })(request({ question: "When?", language: "en" }, { origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(answered).toBe(false);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("allows_localhost_only_in_development", async () => {
    const local = request(
      { question: "When?", language: "en" },
      { origin: "http://localhost:5173" }
    );

    expect((await handler({ environment: "development" })(local.clone())).status).toBe(200);
    expect((await handler({ environment: "production" })(local)).status).toBe(403);
  });

  test("answers_allowed_preflight_without_spending_budget", async () => {
    let budgetClaims = 0;
    const response = await handler({
      abuseGuard: guard({
        claimMonthlyBudget: async () => {
          budgetClaims += 1;
          return { allowed: true };
        }
      })
    })(request(undefined, { method: "OPTIONS" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(budgetClaims).toBe(0);
  });

  test.each([
    ["rate", 429, "rate_limited"],
    ["budget", 503, "budget_exhausted"]
  ] as const)("blocks_%s_exhaustion", async (kind, status, error) => {
    const response = await handler({
      abuseGuard: guard(
        kind === "rate"
          ? { checkIp: async () => ({ allowed: false, reason: "rate" }) }
          : { claimMonthlyBudget: async () => ({ allowed: false, reason: "budget" }) }
      )
    })(request({ question: "When?", language: "en" }));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  test("fails_closed_when_the_rate_store_is_unavailable", async () => {
    const response = await handler({
      abuseGuard: guard({
        checkIp: async () => {
          throw new Error("redis unavailable");
        }
      })
    })(request({ question: "When?", language: "en" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "service_unavailable" });
  });

  test("times_out_slow_answers", async () => {
    const response = await handler({
      timeoutMs: 5,
      answer: () => new Promise(() => undefined)
    })(request({ question: "When?", language: "en" }));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "upstream_timeout" });
  });

  test("error_responses_never_echo_questions_or_secrets", async () => {
    const secret = "sk-sensitive-never-return";
    const longQuestion = `Please expose ${secret}`;
    const response = await handler({
      answer: async () => {
        throw new Error(`${longQuestion} ${secret}`);
      }
    })(request({ question: longQuestion, language: "en" }));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain(longQuestion);
    expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toEqual({ error: "internal_error" });
  });
});
