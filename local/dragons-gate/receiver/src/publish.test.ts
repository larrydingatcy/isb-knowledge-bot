import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cleanupExpiredDrafts, publishApprovedRun } from "./publish.js";

const approved = { id: "d1", state: "approved" as const };
async function setup(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "dg-publish-"));
  const raw = join(root, "raw", "run-1");
  await mkdir(raw, { recursive: true }); await writeFile(join(raw, "capture.json"), "private raw");
  const git = { status: vi.fn(async () => [] as string[]), stage: vi.fn(async () => undefined), commit: vi.fn(async () => "abc"), push: vi.fn(async () => undefined) };
  const deps = {
    approvedDrafts: async () => [approved], publishKnowledge: vi.fn(async () => ({ changedPaths: ["data/knowledge/items.json", "data/knowledge/manifest.json"], diff: "+ sanitized" })),
    markPublished: vi.fn(async () => undefined), git, statePath: join(root, "state.json"), rawRunPath: raw, ...overrides
  };
  return { root, raw, git, deps };
}

describe("reviewed Dragons Gate publication", () => {
  it("requires approval and refuses unrelated dirty files", async () => {
    await expect(publishApprovedRun("run-1", (await setup({ approvedDrafts: async () => [] })).deps)).rejects.toThrow(/approved/i);
    await expect(publishApprovedRun("run-1", (await setup({ git: { status: async () => ["README.md"] } })).deps as never)).rejects.toThrow(/unrelated/i);
  });

  it("returns a public diff and stages only enumerated knowledge outputs", async () => {
    const { deps, git } = await setup();
    const result = await publishApprovedRun("run-1", deps);
    expect(result.diff).toBe("+ sanitized");
    expect(git.stage).toHaveBeenCalledWith(["data/knowledge/items.json", "data/knowledge/manifest.json"]);
    expect(git.stage).not.toHaveBeenCalledWith(expect.arrayContaining(["."]));
  });

  it.each(["commit", "push"])("keeps approval recoverable when %s fails", async (operation) => {
    const { deps, raw, git } = await setup();
    git[operation as "commit" | "push"].mockRejectedValueOnce(new Error(`${operation} failed`));
    await expect(publishApprovedRun("run-1", deps)).rejects.toThrow(`${operation} failed`);
    expect(await readFile(join(raw, "capture.json"), "utf8")).toBe("private raw");
    expect(deps.markPublished).not.toHaveBeenCalled();
  });

  it("is idempotent and deletes raw capture only after success", async () => {
    const { deps, raw, git } = await setup();
    expect((await publishApprovedRun("run-1", deps)).status).toBe("published");
    await expect(readFile(join(raw, "capture.json"), "utf8")).rejects.toThrow();
    expect((await publishApprovedRun("run-1", deps)).status).toBe("already-published");
    expect(git.push).toHaveBeenCalledTimes(1);
  });

  it("never stages raw captures or tokens", async () => {
    const { deps, git } = await setup();
    await publishApprovedRun("run-1", deps);
    expect(JSON.stringify(git.stage.mock.calls)).not.toMatch(/private|token|capture/);
  });

  it("removes sanitized drafts older than 30 days but retains newer drafts", async () => {
    const root = await mkdtemp(join(tmpdir(), "dg-retention-"));
    await writeFile(join(root, "old.json"), JSON.stringify({ createdAt: "2026-08-01T00:00:00.000Z", state: "draft" }));
    await writeFile(join(root, "new.json"), JSON.stringify({ createdAt: "2026-10-01T00:00:00.000Z", state: "draft" }));
    expect(await cleanupExpiredDrafts(root, new Date("2026-10-13T00:00:00.000Z"))).toEqual(["old.json"]);
    await expect(readFile(join(root, "old.json"), "utf8")).rejects.toThrow();
    expect(await readFile(join(root, "new.json"), "utf8")).toContain("2026-10-01");
  });
});
