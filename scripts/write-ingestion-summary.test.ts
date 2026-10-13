import { describe, expect, it } from "vitest";
import { createIngestionSummary } from "./write-ingestion-summary.js";

describe("ingestion workflow summary", () => {
  it.each([
    [{ changedItems: 3, failedSources: 0, blockedItems: 0, staleSources: 0 }, "success", true],
    [{ changedItems: 0, failedSources: 0, blockedItems: 0, staleSources: 0 }, "no-change", false],
    [{ changedItems: 2, failedSources: 1, blockedItems: 0, staleSources: 0 }, "partial-failure", false],
    [{ changedItems: 0, failedSources: 2, blockedItems: 0, staleSources: 0 }, "total-failure", false],
    [{ changedItems: 0, failedSources: 0, blockedItems: 1, staleSources: 0 }, "blocked-pii", false],
    [{ changedItems: 0, failedSources: 0, blockedItems: 0, staleSources: 1 }, "stale-source", false]
  ])("classifies %#", (input, expected, shouldCommit) => {
    const summary = createIngestionSummary(input);
    expect(summary.status).toBe(expected);
    expect(summary.shouldCommit).toBe(shouldCommit);
    expect(summary.markdown).toContain(expected);
  });

  it("never permits a commit for failed or empty results", () => {
    for (const input of [
      { changedItems: 1, failedSources: 1, blockedItems: 0, staleSources: 0 },
      { changedItems: 0, failedSources: 0, blockedItems: 0, staleSources: 0 }
    ]) expect(createIngestionSummary(input).shouldCommit).toBe(false);
  });
});
