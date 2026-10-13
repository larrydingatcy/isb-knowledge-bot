import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { createRequire } from "node:module";
import * as cheerio from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { findPii, type PiiFinding } from "../pipeline/pii.js";
import { normalizeText, sha256 } from "../pipeline/normalize.js";
import { ClamAvScanner, type MalwareScanner } from "./malware.js";

const require = createRequire(import.meta.url);
const parsePdfBuffer = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

export interface UploadMetadata {
  sourceName: string;
  sourceUrl?: string;
  categories: string[];
  validUntil?: string;
  visibility: "public";
}
export type DraftState = "draft" | "blocked" | "approved" | "published" | "withdrawn";
export interface DraftDocument extends UploadMetadata {
  id: string;
  mimeType: string;
  text: string;
  contentHash: string;
  state: DraftState;
  findings: PiiFinding[];
  createdAt: string;
}
export interface FileIngestionDeps {
  scanner?: MalwareScanner;
  parsePdf?: (buffer: Buffer) => Promise<string>;
  parseDocx?: (buffer: Buffer) => Promise<string>;
  now?: () => Date;
}

function looksLikeHtml(buffer: Buffer): boolean {
  return /^\s*(?:<!doctype html|<html|<body|<main)/i.test(buffer.subarray(0, 1024).toString("utf8"));
}

function stripHtml(buffer: Buffer): string {
  const $ = cheerio.load(buffer.toString("utf8"));
  $("script,style,form,input,textarea,select,button,noscript").remove();
  return normalizeText($("main").text() || $("body").text());
}

export async function ingestFile(path: string, metadata: UploadMetadata, deps: FileIngestionDeps = {}): Promise<DraftDocument> {
  const information = await stat(path);
  if (information.size > 20 * 1024 * 1024) throw new Error("File exceeds the 20 MiB upload limit");
  const scanner = deps.scanner ?? new ClamAvScanner();
  const scan = await scanner.scan(path);
  if (!scan.clean) throw new Error(`Malware detected${scan.signature ? `: ${scan.signature}` : ""}`);
  const buffer = await readFile(path);
  const detected = await fileTypeFromBuffer(buffer);
  let mimeType: string;
  let text: string;
  if (looksLikeHtml(buffer)) {
    mimeType = "text/html";
    text = stripHtml(buffer);
  } else if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    mimeType = "application/pdf";
    text = normalizeText(await (deps.parsePdf ?? (async (value) => (await parsePdfBuffer(value)).text))(buffer));
  } else if (detected?.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    text = normalizeText(await (deps.parseDocx ?? (async (value) => (await mammoth.extractRawText({ buffer: value })).value))(buffer));
  } else if (!detected) {
    const decoded = buffer.toString("utf8");
    if (decoded.includes("\uFFFD")) throw new Error("Unsupported binary file type");
    mimeType = basename(path).toLowerCase().endsWith(".md") ? "text/markdown" : "text/plain";
    text = normalizeText(decoded);
  } else {
    throw new Error(`Unsupported file type: ${detected.mime}`);
  }
  if (!text) throw new Error("Document contains no extractable text");
  const findings = findPii(text);
  const createdAt = (deps.now ?? (() => new Date()))().toISOString();
  const contentHash = sha256(text);
  return {
    ...metadata,
    id: `draft-${sha256(`${contentHash}\n${createdAt}`).slice(0, 20)}`,
    mimeType,
    text,
    contentHash,
    state: findings.length ? "blocked" : "draft",
    findings,
    createdAt
  };
}
