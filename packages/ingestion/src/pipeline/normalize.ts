import { createHash } from "node:crypto";

export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
