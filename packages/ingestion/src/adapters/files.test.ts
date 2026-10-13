import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestFile } from "./files.js";
import type { MalwareScanner } from "./malware.js";

const clean: MalwareScanner = { scan: async () => ({ clean: true }) };
const metadata = { sourceName: "ISB notice", categories: ["policies"], visibility: "public" as const };
async function temporary(name: string, content: string | Uint8Array) {
  const root = await mkdtemp(join(tmpdir(), "isb-upload-"));
  const path = join(root, name);
  await writeFile(path, content);
  return path;
}

describe("file ingestion", () => {
  it("detects HTML by content rather than a misleading extension and strips active elements", async () => {
    const path = await temporary("notice.pdf", "<!doctype html><html><body><script>secret()</script><form>Email<input value='child@example.com'></form><main>General school policy for all families.</main></body></html>");
    const draft = await ingestFile(path, metadata, { scanner: clean });
    expect(draft.mimeType).toBe("text/html");
    expect(draft.text).toContain("General school policy");
    expect(draft.text).not.toMatch(/secret|child@example/);
  });

  it.each([
    ["notice.txt", "General school text notice for all families."],
    ["notice.md", "# General school Markdown notice for all families."]
  ])("accepts %s", async (name, content) => {
    await expect(ingestFile(await temporary(name, content), metadata, { scanner: clean })).resolves.toMatchObject({ state: "draft" });
  });

  it("parses PDF and DOCX through content-selected parsers", async () => {
    const pdf = await temporary("wrong.bin", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
    const docx = await temporary("wrong.data", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]));
    await expect(ingestFile(pdf, metadata, { scanner: clean, parsePdf: async () => "PDF school notice content for families." })).resolves.toMatchObject({ mimeType: "application/pdf" });
    await expect(ingestFile(docx, metadata, { scanner: clean, parseDocx: async () => "DOCX school notice content for families." })).resolves.toMatchObject({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  });

  it("rejects corrupt or encrypted PDF parser failures", async () => {
    const pdf = await temporary("notice.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]));
    await expect(ingestFile(pdf, metadata, { scanner: clean, parsePdf: async () => { throw new Error("encrypted PDF"); } })).rejects.toThrow(/encrypted PDF/);
  });

  it("fails closed for malware and unavailable scanners", async () => {
    const path = await temporary("eicar.txt", "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    await expect(ingestFile(path, metadata, { scanner: { scan: async () => ({ clean: false, signature: "EICAR-Test" }) } })).rejects.toThrow(/malware/i);
    await expect(ingestFile(path, metadata, { scanner: { scan: async () => { throw new Error("scanner unavailable"); } } })).rejects.toThrow(/scanner unavailable/);
  });

  it("blocks oversized files before parsing", async () => {
    const path = await temporary("large.txt", new Uint8Array(20 * 1024 * 1024 + 1));
    await expect(ingestFile(path, metadata, { scanner: clean })).rejects.toThrow(/20 MiB/);
  });

  it.each([
    "Student ID: S123456 has a notice.",
    "Email parent@example.com for the notice.",
    "Phone +86 13800138000 for details.",
    "Account balance: RMB 120."
  ])("marks PII-containing content blocked: %s", async (content) => {
    const draft = await ingestFile(await temporary("notice.txt", content), metadata, { scanner: clean });
    expect(draft.state).toBe("blocked");
    expect(draft.findings.length).toBeGreaterThan(0);
  });
});
