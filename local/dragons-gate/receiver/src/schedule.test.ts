import { describe, expect, it } from "vitest";
import { nextRunDecision, notificationDecision } from "./schedule.js";

const config = { weekday: 0, hour: 9, timezone: "Asia/Nicosia" };

describe("weekly scheduling", () => {
  it("runs at the weekly due time", () => {
    expect(nextRunDecision({}, new Date("2026-10-18T06:05:00Z"), config)).toBe("scheduled");
  });

  it("runs one catch-up after the Mac was asleep", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    expect(nextRunDecision({ lastRunAt: "2026-10-10T08:00:00Z" }, now, config)).toBe("catch-up");
    expect(nextRunDecision({ lastRunAt: "2026-10-19T07:30:00Z" }, now, config)).toBe("none");
  });

  it("does not duplicate within the same week", () => {
    expect(nextRunDecision({ lastRunAt: "2026-10-18T06:10:00Z" }, new Date("2026-10-18T08:00:00Z"), config)).toBe("none");
  });

  it("handles Cyprus daylight-saving transition", () => {
    expect(nextRunDecision({}, new Date("2026-10-25T07:05:00Z"), config)).toBe("scheduled");
  });
});

describe("notification policy", () => {
  it("stays quiet for no changes", () => expect(notificationDecision({ kind: "no-change" }, {})).toBe("quiet"));
  it.each(["important-change", "login-expired", "approval-required"] as const)("notifies for %s", (kind) => expect(notificationDecision({ kind }, {})).toBe("notify"));
  it("throttles repeated identical failures", () => {
    expect(notificationDecision({ kind: "failure", fingerprint: "network" }, { lastFailureFingerprint: "network", lastFailureNotifiedAt: "2026-10-13T00:00:00Z", now: "2026-10-13T01:00:00Z" })).toBe("quiet");
    expect(notificationDecision({ kind: "failure", fingerprint: "network" }, { lastFailureFingerprint: "network", lastFailureNotifiedAt: "2026-10-11T00:00:00Z", now: "2026-10-13T01:00:00Z" })).toBe("notify");
  });
});
