import { extractCapture } from "./capture.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "extract-capture") return false;
  try { sendResponse({ ok: true, capture: extractCapture(document, message.context) }); }
  catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
  return false;
});
