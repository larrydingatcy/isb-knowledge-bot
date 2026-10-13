import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { processCaptureRun, processCaptures } from "./process.js";
import type { CaptureRecord } from "./policy.js";

const fixture = async (name: string) => JSON.parse(await readFile(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), "utf8")) as CaptureRecord;
const policy = { allowedHosts: ["www.isb.cn"], existingHashes: [] as string[], existingFacts: new Map<string, string>() };

describe("Dragons Gate processing policy", () => {
  it("accepts a general event for first-publication review and strips private URL parts", async () => {
    const result = processCaptures([await fixture("general-event.json")], policy);
    expect(result.reviewRequired).toHaveLength(1);
    expect(result.reviewRequired[0]?.document.canonicalUrl).toBe("https://www.isb.cn/events/family-day");
    expect(result.blocked).toHaveLength(0);
  });

  it.each([
    "Student name: Example Child. Class 5A schedule is attached.",
    "Lunch account balance RMB 120.",
    "Contact parent@example.invalid or +86 13800138000. Student ID: S12345.",
    "General event for all families. Student name: Example Child in class 5A attends."
  ])("blocks private content: %s", (text) => {
    const result = processCaptures([{ runId: "r", nonce: "nonce-12345678", url: "https://www.isb.cn/page", title: "Notice", text, capturedAt: "2026-10-13T00:00:00.000Z" }], policy);
    expect(result.blocked).toHaveLength(1);
    expect(result.publicCandidates).toHaveLength(0);
  });

  it("rejects a login shell", () => {
    const result = processCaptures([{ runId: "r", nonce: "nonce-12345678", url: "https://www.isb.cn/login", title: "Sign in", text: "Username Password Forgot password", capturedAt: "2026-10-13T00:00:00.000Z" }], policy);
    expect(result.loginExpired).toBe(true);
    expect(result.publicCandidates).toHaveLength(0);
  });

  it("treats an identical recapture as no change", async () => {
    const first = processCaptures([await fixture("general-event.json")], policy);
    const hash = first.reviewRequired[0]!.contentHash;
    const again = processCaptures([await fixture("general-event.json")], { ...policy, existingHashes: [hash] });
    expect(again.noChange).toBe(1);
    expect(again.reviewRequired).toHaveLength(0);
  });

  it("requires review when an important deadline changes", async () => {
    const event = await fixture("general-event.json");
    const key = "family day";
    const result = processCaptures([{ ...event, text: event.text.replace("November 1", "November 3") }], { ...policy, existingFacts: new Map([[key, event.text]]) });
    expect(result.reviewRequired[0]?.reasons).toContain("important-fact-changed");
  });

  it("never copies child fixture data into public candidates", async () => {
    const result = processCaptures([await fixture("private-child-page.json")], policy);
    expect(JSON.stringify(result.publicCandidates)).not.toMatch(/Example Child|parent@example|RMB 120/);
  });

  it("deletes raw captures after creating a sanitized local preview", async () => {
    const root = await mkdtemp(join(tmpdir(), "dg-process-"));
    const runDir = join(root, "captures", "run-general");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "capture-one.json"), JSON.stringify(await fixture("general-event.json")));
    const result = await processCaptureRun("run-general", policy, { captureRoot: join(root, "captures"), previewRoot: join(root, "previews") });
    expect(result.previewPaths).toHaveLength(1);
    await expect(readFile(join(runDir, "capture-one.json"), "utf8")).rejects.toThrow();
  });
});
