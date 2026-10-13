import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const plistPath = join(homedir(), "Library", "LaunchAgents", "com.isb.dragons-gate-receiver.plist");
await execFileAsync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}`, plistPath]).catch(() => undefined);
await rm(plistPath, { force: true });
if (process.argv.includes("--purge")) await rm(join(homedir(), "Library", "Application Support", "ISBKnowledge"), { recursive: true, force: true });
console.log(JSON.stringify({ uninstalled: true, privateConfigPreserved: !process.argv.includes("--purge") }));
