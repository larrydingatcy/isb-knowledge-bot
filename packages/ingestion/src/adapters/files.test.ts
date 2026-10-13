import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
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
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>School notice</w:t></w:r></w:p></w:body></w:document>`);
    const docx = await temporary("wrong.data", await zip.generateAsync({ type: "uint8array" }));
    await expect(ingestFile(pdf, metadata, { scanner: clean, parsePdf: async () => "PDF school notice content for families." })).resolves.toMatchObject({ mimeType: "application/pdf" });
    await expect(ingestFile(docx, metadata, { scanner: clean, parseDocx: async () => "DOCX school notice content for families." })).resolves.toMatchObject({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  });

  it("rejects an ordinary ZIP instead of treating it as DOCX", async () => {
    const zip = new JSZip();
    zip.file("notes.txt", "not a Word document");
    const path = await temporary("fake.docx", await zip.generateAsync({ type: "uint8array" }));
    await expect(ingestFile(path, metadata, { scanner: clean, parseDocx: async () => "must not run" })).rejects.toThrow(/unsupported file type/i);
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
