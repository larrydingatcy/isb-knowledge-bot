export interface CaptureContext { runId: string; nonce: string; capturedAt: string; allowedHosts: string[]; maxTextLength: number }
export interface CapturePayload { runId: string; nonce: string; capturedAt: string; url: string; title: string; text: string }

export function extractCapture(document: Document, context: CaptureContext): CapturePayload {
  const clone = document.cloneNode(true) as Document;
  clone.querySelectorAll("script,style,form,input,textarea,select,button,noscript,[hidden]").forEach((element) => element.remove());
  const canonical = clone.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href || document.location.href;
  const url = new URL(canonical, document.location.href);
  if (url.protocol !== "https:" || !context.allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Capture URL is outside the allowlist");
  url.search = "";
  url.hash = "";
  const text = (clone.querySelector("main")?.textContent || clone.body?.textContent || "").replace(/\s+/g, " ").trim();
  if (/\b(sign[ -]?in|log[ -]?in)\b/i.test(`${document.title} ${text}`) && /\b(password|username|forgot password)\b/i.test(text)) throw new Error("Login or expired-session page detected");
  return { runId: context.runId, nonce: context.nonce, capturedAt: context.capturedAt, url: url.href, title: document.title.trim(), text: text.slice(0, context.maxTextLength) };
}

export async function withNavigationTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Navigation timeout")), milliseconds))]);
}

export function createSyncProgress(total: number) {
  let completed = 0;
  return {
    completeOne() { completed = Math.min(total, completed + 1); },
    snapshot() { return { completed, total, status: completed === total ? "complete" as const : "running" as const }; }
  };
}
