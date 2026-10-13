import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface IngestionCounts { changedItems: number; failedSources: number; blockedItems: number; staleSources: number }
export interface IngestionSummary extends IngestionCounts {
  status: "success" | "no-change" | "partial-failure" | "total-failure" | "blocked-pii" | "stale-source";
  shouldCommit: boolean;
  generatedAt: string;
  markdown: string;
}

export function createIngestionSummary(input: IngestionCounts, now = new Date()): IngestionSummary {
  let status: IngestionSummary["status"];
  if (input.failedSources > 0) status = input.changedItems > 0 ? "partial-failure" : "total-failure";
  else if (input.blockedItems > 0) status = "blocked-pii";
  else if (input.staleSources > 0) status = "stale-source";
  else if (input.changedItems === 0) status = "no-change";
  else status = "success";
  const shouldCommit = status === "success" && input.changedItems > 0;
  const markdown = `## ISB ingestion: ${status}\n\n| Changed | Failed sources | Blocked PII | Stale sources | Commit |\n|---:|---:|---:|---:|:---:|\n| ${input.changedItems} | ${input.failedSources} | ${input.blockedItems} | ${input.staleSources} | ${shouldCommit ? "yes" : "no"} |\n`;
  return { ...input, status, shouldCommit, generatedAt: now.toISOString(), markdown };
}

function value(name: string): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1] ?? 0) : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = createIngestionSummary({ changedItems: value("changed-items"), failedSources: value("failed-sources"), blockedItems: value("blocked-items"), staleSources: value("stale-sources") });
  const output = resolve("artifacts/ingestion-summary.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary.markdown);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `should_commit=${String(summary.shouldCommit)}\nstatus=${summary.status}\n`);
  console.log(JSON.stringify(summary));
}
