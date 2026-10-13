import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { createSyncProgress, extractCapture, withNavigationTimeout } from "./capture.js";

const context = { runId: "run-1", nonce: "nonce-12345678", capturedAt: "2026-10-13T00:00:00.000Z", allowedHosts: ["dragonsgate.isb.cn"], maxTextLength: 1000 };

describe("Dragons Gate capture extraction", () => {
  it("extracts title, canonical URL, and inert main text", () => {
    const dom = new JSDOM(`<!doctype html><html><head><title>School Calendar</title><link rel="canonical" href="https://dragonsgate.isb.cn/calendar"></head><body><nav>Menu</nav><main><h1>Calendar</h1><p>General school dates for all families.</p><script>steal()</script><form><input type="hidden" value="token"><input value="child@example.com"></form></main></body></html>`, { url: "https://dragonsgate.isb.cn/calendar?session=private" });
    const capture = extractCapture(dom.window.document, context);
    expect(capture).toMatchObject({ title: "School Calendar", url: "https://dragonsgate.isb.cn/calendar" });
    expect(capture.text).toContain("General school dates");
    expect(capture.text).not.toMatch(/steal|token|child@example/);
    expect(capture).not.toHaveProperty("token");
  });

  it("detects login shells and rejects off-host canonical redirects", () => {
    const login = new JSDOM(`<html><head><title>Sign in</title></head><body><main>Username Password Forgot password</main></body></html>`, { url: "https://dragonsgate.isb.cn/login" });
    expect(() => extractCapture(login.window.document, context)).toThrow(/login/i);
    const evil = new JSDOM(`<html><head><title>Notice</title><link rel="canonical" href="https://evil.example/page"></head><body><main>General school notice for families.</main></body></html>`, { url: "https://dragonsgate.isb.cn/page" });
    expect(() => extractCapture(evil.window.document, context)).toThrow(/allowlist/i);
  });

  it("caps captured text", () => {
    const dom = new JSDOM(`<html><head><title>Notice</title></head><body><main>${"x".repeat(200)}</main></body></html>`, { url: "https://dragonsgate.isb.cn/page" });
    expect(extractCapture(dom.window.document, { ...context, maxTextLength: 50 }).text).toHaveLength(50);
  });

  it("times out navigation", async () => {
    vi.useFakeTimers();
    const promise = withNavigationTimeout(new Promise(() => undefined), 1000);
    const rejection = expect(promise).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(1001);
    await rejection;
    vi.useRealTimers();
  });

  it("reports manual sync progress", () => {
    const progress = createSyncProgress(3);
    expect(progress.snapshot()).toEqual({ completed: 0, total: 3, status: "running" });
    progress.completeOne(); progress.completeOne(); progress.completeOne();
    expect(progress.snapshot()).toEqual({ completed: 3, total: 3, status: "complete" });
  });
});
