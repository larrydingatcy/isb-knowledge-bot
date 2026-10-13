import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DraftDocument } from "../adapters/files.js";

export class DraftStore {
  constructor(private readonly root: string) {}

  private path(id: string): string { return join(this.root, `${id}.json`); }

  private async audit(action: string, draft: DraftDocument): Promise<void> {
    const record = { at: new Date().toISOString(), action, id: draft.id, contentHash: draft.contentHash, state: draft.state, sourceName: draft.sourceName };
    await appendFile(join(this.root, "audit.ndjson"), `${JSON.stringify(record)}\n`, "utf8");
  }

  async create(draft: DraftDocument): Promise<DraftDocument> {
    await mkdir(this.root, { recursive: true });
    for (const name of (await readdir(this.root)).filter((value) => value.endsWith(".json"))) {
      const existing = JSON.parse(await readFile(join(this.root, name), "utf8")) as DraftDocument;
      if (existing.contentHash === draft.contentHash && existing.state !== "withdrawn") throw new Error(`Duplicate draft content: ${existing.id}`);
    }
    await writeFile(this.path(draft.id), `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    await this.audit("create", draft);
    return draft;
  }

  async preview(id: string): Promise<DraftDocument> {
    return JSON.parse(await readFile(this.path(id), "utf8")) as DraftDocument;
  }

  async list(): Promise<DraftDocument[]> {
    await mkdir(this.root, { recursive: true });
    const names = (await readdir(this.root)).filter((value) => value.endsWith(".json")).sort();
    return Promise.all(names.map(async (name) => JSON.parse(await readFile(join(this.root, name), "utf8")) as DraftDocument));
  }

  private async transition(id: string, allowed: DraftDocument["state"][], state: DraftDocument["state"], changes: Partial<DraftDocument> = {}): Promise<DraftDocument> {
    const draft = await this.preview(id);
    if (!allowed.includes(draft.state)) throw new Error(`Illegal draft transition: ${draft.state} -> ${state}`);
    const next = { ...draft, ...changes, state };
    await writeFile(this.path(id), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await this.audit(state, next);
    return next;
  }

  async approve(id: string, options: { redactionAcknowledged?: boolean; redactedText?: string } = {}): Promise<DraftDocument> {
    const draft = await this.preview(id);
    if (draft.state === "blocked") {
      if (!options.redactionAcknowledged || !options.redactedText) throw new Error("Redaction acknowledgment and sanitized text are required");
      return this.transition(id, ["blocked"], "approved", { text: options.redactedText, findings: [] });
    }
    return this.transition(id, ["draft"], "approved");
  }

  async markPublished(id: string): Promise<DraftDocument> { return this.transition(id, ["approved"], "published"); }
  async withdraw(id: string): Promise<DraftDocument> { return this.transition(id, ["draft", "blocked", "approved", "published"], "withdrawn"); }
}
