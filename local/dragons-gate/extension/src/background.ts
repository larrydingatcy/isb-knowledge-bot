import { withNavigationTimeout } from "./capture.js";

const START_URLS = ["https://dragonsgate.isb.cn/"];
const RECEIVER = "http://127.0.0.1:43117";

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

chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create("weekly-sync", { periodInMinutes: 7 * 24 * 60 }); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "weekly-sync") void syncNow(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sync-now") return false;
  void syncNow().then((result) => sendResponse({ ok: true, ...result }), (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
