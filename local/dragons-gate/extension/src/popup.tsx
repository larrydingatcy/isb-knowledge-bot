import { dgConfig } from "./config.js";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
void chrome.storage.local.get("connectorToken").then((value) => { if (typeof value.connectorToken === "string") token.placeholder = "Saved securely in this Chrome profile"; });
document.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", async () => {
  const value = token.value.trim();
  if (value.length < 32) { status.textContent = "Token must be at least 32 characters"; return; }
  await chrome.storage.local.set({ connectorToken: value });
  token.value = "";
  token.placeholder = "Saved securely in this Chrome profile";
  status.textContent = "Token saved locally";
});
document.querySelector<HTMLButtonElement>("#sync")!.addEventListener("click", async () => {
  const origins = [...dgConfig.allowedHosts.map((host) => `https://${host}/*`), `${new URL(dgConfig.receiverUrl).origin}/*`];
  const granted = await chrome.permissions.request({ origins });
  if (!granted) { status.textContent = "Permission not granted"; return; }
  status.textContent = "Syncing…";
  const result = await chrome.runtime.sendMessage({ type: "sync-now" });
  status.textContent = result?.ok ? `Captured ${result.captured} page(s)` : `Stopped: ${result?.error || "unknown error"}`;
});
