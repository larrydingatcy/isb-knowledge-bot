import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RawDocument } from "../../../../packages/ingestion/src/adapters/types.js";
import { normalizeText, sha256 } from "../../../../packages/ingestion/src/pipeline/normalize.js";
import { isLoginShell, privacyReasons, type CaptureRecord, type DragonsGatePolicy } from "./policy.js";

export interface ReviewCandidate { document: RawDocument; contentHash: string; reasons: string[] }
export interface ProcessSummary {
  publicCandidates: ReviewCandidate[];
  reviewRequired: ReviewCandidate[];
  blocked: Array<{ url: string; reasons: string[] }>;
  conflicts: string[];
  loginExpired: boolean;
  noChange: number;
  previewPaths: string[];
}

function cleanUrl(value: string, allowedHosts: string[]): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("Capture URL is outside the Dragons Gate allowlist");
  url.search = "";
  url.hash = "";
  return url.href;
}

export function processCaptures(captures: CaptureRecord[], policy: DragonsGatePolicy): ProcessSummary {
  const result: ProcessSummary = { publicCandidates: [], reviewRequired: [], blocked: [], conflicts: [], loginExpired: false, noChange: 0, previewPaths: [] };
  for (const capture of captures) {
    if (isLoginShell(capture)) { result.loginExpired = true; continue; }
    const reasons = privacyReasons(capture);
    if (reasons.length) { result.blocked.push({ url: cleanUrl(capture.url, policy.allowedHosts), reasons }); continue; }
    const text = normalizeText(capture.text);
    const contentHash = sha256(text);
    if (policy.existingHashes.includes(contentHash)) { result.noChange += 1; continue; }
    const key = normalizeText(capture.title).toLocaleLowerCase();
    const old = policy.existingFacts.get(key);
    const reviewReasons = [old ? "content-changed" : "first-publication"];
    if (old && old !== text && /\b(?:deadline|closes?|fee|cost|eligible|policy|November|December|January|February|March|April|May|June|July|August|September|October)\b/i.test(`${old} ${text}`)) reviewReasons.push("important-fact-changed");
    const candidate: ReviewCandidate = {
      document: { canonicalUrl: cleanUrl(capture.url, policy.allowedHosts), title: normalizeText(capture.title), language: /[\u3400-\u9fff]/u.test(text) ? "zh" : "en", text, fetchedAt: new Date(capture.capturedAt).toISOString(), attachments: [] },
      contentHash,
      reasons: reviewReasons
    };
    result.publicCandidates.push(candidate);
    result.reviewRequired.push(candidate);
  }
  return result;
}

export async function processCaptureRun(runId: string, policy: DragonsGatePolicy, options: { captureRoot: string; previewRoot: string }): Promise<ProcessSummary> {
  const runDir = join(options.captureRoot, runId);
  const captures: CaptureRecord[] = [];
  for (const name of (await readdir(runDir)).filter((value) => value.startsWith("capture-") && value.endsWith(".json")).sort()) captures.push(JSON.parse(await readFile(join(runDir, name), "utf8")) as CaptureRecord);
  const summary = processCaptures(captures, policy);
  await mkdir(options.previewRoot, { recursive: true, mode: 0o700 });
  for (const candidate of summary.reviewRequired) {
    const path = join(options.previewRoot, `${candidate.contentHash.slice(0, 20)}.json`);
    await writeFile(path, `${JSON.stringify({ title: candidate.document.title, sourceUrl: candidate.document.canonicalUrl, text: candidate.document.text, reasons: candidate.reasons }, null, 2)}\n`, { mode: 0o600 });
    summary.previewPaths.push(path);
  }
  return summary;
}
