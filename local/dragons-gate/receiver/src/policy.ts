import { findPii } from "../../../../packages/ingestion/src/pipeline/pii.js";

export interface CaptureRecord { runId: string; nonce: string; url: string; title: string; text: string; capturedAt: string }
export interface DragonsGatePolicy { allowedHosts: string[]; existingHashes: string[]; existingFacts: Map<string, string> }

export function privacyReasons(capture: CaptureRecord): string[] {
  const text = `${capture.title}\n${capture.text}`;
  const reasons = findPii(text).map((finding) => finding.kind);
  if (/\b(?:student name|child(?:'s)? name|my child)\b/i.test(text) && /\b(?:class|schedule|timetable|homeroom|grade)\b/i.test(text)) reasons.push("child-class-or-schedule");
  if (/\b(?:balance|account|student account|lunch account|meal account)\b/i.test(text)) reasons.push("account-or-balance");
  return [...new Set(reasons)];
}

export function isLoginShell(capture: CaptureRecord): boolean {
  const text = `${capture.title} ${capture.text}`;
  return /\b(sign[ -]?in|log[ -]?in)\b/i.test(text) && /\b(password|username|forgot password)\b/i.test(text);
}
