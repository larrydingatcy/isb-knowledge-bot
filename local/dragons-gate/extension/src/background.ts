import { withNavigationTimeout } from "./capture.js";

const START_URLS = ["https://dragonsgate.isb.cn/"];
const RECEIVER = "http://127.0.0.1:43117";

function nextSundayAtNine(): number {
  const next = new Date();
  const days = (7 - next.getDay()) % 7;
  next.setDate(next.getDate() + days);
  next.setHours(9, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 7);
  return next.getTime();
}

async function scheduledSync(): Promise<void> {
  try { await syncNow(); }
  catch (error) {
    await chrome.storage.local.set({ lastRunStatus: "failed", lastFailure: error instanceof Error ? error.message : String(error) });
    await chrome.notifications.create({ type: "basic", iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect width='128' height='128' rx='64' fill='%230b2b4c'/%3E%3Ctext x='64' y='78' text-anchor='middle' font-size='42' fill='white'%3EISB%3C/text%3E%3C/svg%3E", title: "ISB sync needs attention", message: error instanceof Error ? error.message : String(error) });
  }
}

async function catchUpIfMissed(): Promise<void> {
  const { lastRunAt, connectorToken } = await chrome.storage.local.get(["lastRunAt", "connectorToken"]);
  if (typeof connectorToken === "string" && typeof lastRunAt === "string" && Date.now() - new Date(lastRunAt).getTime() > 7 * 24 * 60 * 60 * 1000) await scheduledSync();
}

async function waitForComplete(tabId: number): Promise<void> {
  return withNavigationTimeout(new Promise((resolve) => {
    const listener = (changedId: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (changedId === tabId && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
    };
    chrome.tabs.onUpdated.addListener(listener);
  }), 30_000);
}

export async function syncNow(): Promise<{ captured: number }> {
  const { connectorToken } = await chrome.storage.local.get("connectorToken");
  if (typeof connectorToken !== "string") throw new Error("Connector token is not configured");
  const runId = `run-${Date.now()}`;
  let captured = 0;
  for (const url of START_URLS) {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) throw new Error("Chrome did not create a capture tab");
    try {
      await waitForComplete(tab.id);
      const result = await chrome.tabs.sendMessage(tab.id, { type: "extract-capture", context: { runId, nonce: crypto.randomUUID(), capturedAt: new Date().toISOString(), allowedHosts: ["dragonsgate.isb.cn"], maxTextLength: 1_500_000 } });
      if (!result?.ok) throw new Error(result?.error || "Capture failed");
      const response = await fetch(`${RECEIVER}/v1/captures`, { method: "POST", headers: { authorization: `Bearer ${connectorToken}`, "content-type": "application/json" }, body: JSON.stringify(result.capture) });
      if (!response.ok) throw new Error(`Receiver rejected capture (${response.status})`);
      captured += 1;
    } finally { await chrome.tabs.remove(tab.id); }
  }
  await fetch(`${RECEIVER}/v1/runs/${runId}/complete`, { method: "POST", headers: { authorization: `Bearer ${connectorToken}`, "content-type": "application/json" }, body: JSON.stringify({ status: "complete" }) });
  await chrome.storage.local.set({ lastRunAt: new Date().toISOString(), lastRunStatus: "complete" });
  return { captured };
}

chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create("weekly-sync", { when: nextSundayAtNine(), periodInMinutes: 7 * 24 * 60 }); });
chrome.runtime.onStartup.addListener(() => { void catchUpIfMissed(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "weekly-sync") void scheduledSync(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sync-now") return false;
  void syncNow().then((result) => sendResponse({ ok: true, ...result }), (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
