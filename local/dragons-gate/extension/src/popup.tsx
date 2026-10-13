const status = document.querySelector<HTMLParagraphElement>("#status")!;
document.querySelector<HTMLButtonElement>("#sync")!.addEventListener("click", async () => {
  const granted = await chrome.permissions.request({ origins: ["https://dragonsgate.isb.cn/*", "http://127.0.0.1:43117/*"] });
  if (!granted) { status.textContent = "Permission not granted"; return; }
  status.textContent = "Syncing…";
  const result = await chrome.runtime.sendMessage({ type: "sync-now" });
  status.textContent = result?.ok ? `Captured ${result.captured} page(s)` : `Stopped: ${result?.error || "unknown error"}`;
});
