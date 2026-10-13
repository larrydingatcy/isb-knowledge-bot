import { describe, expect, it, vi } from "vitest";
import { runDragonsGateCli } from "./dragons-gate.js";

describe("Dragons Gate CLI", () => {
  it("supports status and preview without mutation", async () => {
    expect(await runDragonsGateCli(["status"], { status: async () => ({ receiver: "ready" }) })).toMatchObject({ exitCode: 0 });
    const preview = vi.fn(async () => ({ id: "d1" }));
    expect((await runDragonsGateCli(["preview", "d1"], { preview })).exitCode).toBe(0);
    expect(preview).toHaveBeenCalledWith("d1");
  });

  it("routes approve, publish, discard, and cleanup", async () => {
    const deps = { approve: vi.fn(), publish: vi.fn(), discard: vi.fn(), cleanup: vi.fn() };
    for (const [args, method] of [[['approve', 'd1'], 'approve'], [['publish', 'run-1'], 'publish'], [['discard', 'd1'], 'discard'], [['cleanup'], 'cleanup']] as const) {
      expect((await runDragonsGateCli([...args], deps)).exitCode).toBe(0);
      expect(deps[method]).toHaveBeenCalled();
    }
  });

  it("returns nonzero for unknown commands", async () => {
    expect((await runDragonsGateCli(["unknown"], {})).exitCode).toBe(2);
  });
});
