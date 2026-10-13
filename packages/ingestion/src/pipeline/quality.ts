import type { RawDocument } from "../adapters/types.js";
import { normalizeText } from "./normalize.js";

export function assertDocumentQuality(document: RawDocument): void {
  const text = normalizeText(document.text);
  if (text.length < 20) throw new Error(`Quality gate failed for ${document.canonicalUrl}: empty or too short`);
  if (/\b(sign[ -]?in|log[ -]?in)\b/i.test(text) && /\b(password|forgot password|username)\b/i.test(text)) {
    throw new Error(`Quality gate failed for ${document.canonicalUrl}: login shell detected`);
  }
  if (!normalizeText(document.title)) throw new Error(`Quality gate failed for ${document.canonicalUrl}: missing title`);
}
