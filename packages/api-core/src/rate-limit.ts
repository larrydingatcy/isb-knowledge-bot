import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type GuardDecision =
  | { allowed: true }
  | { allowed: false; reason: "rate" | "budget" };

export interface AbuseGuard {
  checkIp(ip: string): Promise<GuardDecision>;
  claimMonthlyBudget(now: Date): Promise<GuardDecision>;
}

export interface UpstashGuardEnvironment {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  MONTHLY_REQUEST_BUDGET?: string;
}

function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthEpochSeconds(now: Date): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
}

export function createUpstashAbuseGuard(
  environment: UpstashGuardEnvironment = process.env
): AbuseGuard {
  const url = environment.UPSTASH_REDIS_REST_URL;
  const token = environment.UPSTASH_REDIS_REST_TOKEN;
  const budget = Number(environment.MONTHLY_REQUEST_BUDGET);
  if (!url || !token || !Number.isSafeInteger(budget) || budget <= 0) {
    throw new Error("Upstash credentials and a positive MONTHLY_REQUEST_BUDGET are required");
  }

  const redis = new Redis({ url, token });
  const perIp = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "isb-chat:ip"
  });

  return {
    async checkIp(ip: string): Promise<GuardDecision> {
      const result = await perIp.limit(ip);
      return result.success ? { allowed: true } : { allowed: false, reason: "rate" };
    },
    async claimMonthlyBudget(now: Date): Promise<GuardDecision> {
      const key = `isb-chat:budget:${monthKey(now)}`;
      const count = await redis.incr(key);
      await redis.expireat(key, nextMonthEpochSeconds(now));
      return count <= budget ? { allowed: true } : { allowed: false, reason: "budget" };
    }
  };
}
