import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DraftStore } from "./drafts.js";
import type { DraftDocument } from "../adapters/files.js";

const draft = (overrides: Partial<DraftDocument> = {}): DraftDocument => ({
  id: "draft-1", sourceName: "ISB", categories: ["policies"], visibility: "public", mimeType: "text/plain",
  text: "General school notice for families.", contentHash: "a".repeat(64), state: "draft", findings: [], createdAt: "2026-10-13T00:00:00.000Z", ...overrides
});

describe("draft state machine", () => {
  it("creates and previews a draft without mutation", async () => {
    const store = new DraftStore(await mkdtemp(join(tmpdir(), "isb-drafts-")));
    await store.create(draft());
    expect(await store.preview("draft-1")).toMatchObject({ state: "draft" });
    expect(await store.preview("draft-1")).toMatchObject({ state: "draft" });
  });

  it("requires redaction acknowledgment before approving blocked content", async () => {
    const store = new DraftStore(await mkdtemp(join(tmpdir(), "isb-drafts-")));
    await store.create(draft({ state: "blocked", findings: [{ kind: "email", match: "redacted" }] }));
    await expect(store.approve("draft-1")).rejects.toThrow(/acknowledgment/i);
    await expect(store.approve("draft-1", { redactionAcknowledged: true, redactedText: "Sanitized general notice." })).resolves.toMatchObject({ state: "approved" });
    const approved = await store.preview("draft-1");
    expect(approved.contentHash).not.toBe("a".repeat(64));
  });

  it("rejects duplicate hashes and illegal transitions", async () => {
    const store = new DraftStore(await mkdtemp(join(tmpdir(), "isb-drafts-")));
    await store.create(draft());
    await expect(store.create(draft({ id: "draft-2" }))).rejects.toThrow(/duplicate/i);
    await store.approve("draft-1");
    await store.markPublished("draft-1");
    await expect(store.approve("draft-1")).rejects.toThrow(/transition/i);
  });

  it("withdraws published derived items", async () => {
    const store = new DraftStore(await mkdtemp(join(tmpdir(), "isb-drafts-")));
    await store.create(draft());
    await store.approve("draft-1");
    await store.markPublished("draft-1");
    await expect(store.withdraw("draft-1")).resolves.toMatchObject({ state: "withdrawn" });
  });
});
