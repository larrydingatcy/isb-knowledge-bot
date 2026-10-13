import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitClient {
  status(): Promise<string[]>;
  stage(paths: string[]): Promise<void>;
  commit(message: string): Promise<string>;
  push(): Promise<void>;
}
export interface ApprovedDraft { id: string; state: "approved" }
export interface PublishDeps {
  approvedDrafts(): Promise<ApprovedDraft[]>;
  publishKnowledge(drafts: ApprovedDraft[]): Promise<{ changedPaths: string[]; diff: string }>;
  markPublished(id: string): Promise<void>;
  git: GitClient;
  statePath: string;
  rawRunPath: string;
}
export interface PublishSummary { status: "published" | "already-published"; commit?: string; diff?: string; changedPaths?: string[] }

export class ShellGitClient implements GitClient {
  constructor(private readonly cwd: string) {}
  private async run(args: string[]) { return (await execFileAsync("git", args, { cwd: this.cwd })).stdout.trim(); }
  async status() { return (await this.run(["status", "--porcelain"])).split("\n").filter(Boolean).map((line) => line.slice(3)); }
  async stage(paths: string[]) { await this.run(["add", "--", ...paths]); }
  async commit(message: string) { await this.run(["commit", "-m", message]); return this.run(["rev-parse", "HEAD"]); }
  async push() { await this.run(["push"]); }
}

export async function cleanupExpiredDrafts(root: string, now = new Date()): Promise<string[]> {
  const removed: string[] = [];
  let names: string[];
  try { names = (await readdir(root)).filter((name) => name.endsWith(".json")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return removed; throw error; }
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const name of names) {
    const value = JSON.parse(await readFile(join(root, name), "utf8")) as { createdAt?: string; state?: string };
    if (value.state !== "published" && value.createdAt && new Date(value.createdAt).getTime() < cutoff) {
      await rm(join(root, name), { force: true });
      removed.push(name);
    }
  }
  return removed.sort();
}

async function readState(path: string): Promise<{ publishedRuns: Record<string, string> }> {
  try { return JSON.parse(await readFile(path, "utf8")) as { publishedRuns: Record<string, string> }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { publishedRuns: {} }; throw error; }
}

export async function publishApprovedRun(runId: string, deps: PublishDeps): Promise<PublishSummary> {
  const state = await readState(deps.statePath);
  if (state.publishedRuns[runId]) return { status: "already-published", commit: state.publishedRuns[runId] };
  const drafts = await deps.approvedDrafts();
  if (drafts.length === 0 || drafts.some((draft) => draft.state !== "approved")) throw new Error("At least one approved draft is required");
  const dirty = await deps.git.status();
  const unrelated = dirty.filter((path) => !path.startsWith("data/knowledge/"));
  if (unrelated.length) throw new Error(`Unrelated worktree changes must be resolved: ${unrelated.join(", ")}`);
  const publication = await deps.publishKnowledge(drafts);
  if (publication.changedPaths.length === 0) throw new Error("Publication produced no knowledge changes");
  if (publication.changedPaths.some((path) => !path.startsWith("data/knowledge/"))) throw new Error("Publication attempted to change a non-knowledge path");
  await deps.git.stage(publication.changedPaths);
  const commit = await deps.git.commit(`chore: publish reviewed Dragons Gate run ${runId}`);
  await deps.git.push();
  for (const draft of drafts) await deps.markPublished(draft.id);
  state.publishedRuns[runId] = commit;
  await mkdir(dirname(deps.statePath), { recursive: true, mode: 0o700 });
  await writeFile(deps.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rm(deps.rawRunPath, { recursive: true, force: true });
  return { status: "published", commit, diff: publication.diff, changedPaths: publication.changedPaths };
}
