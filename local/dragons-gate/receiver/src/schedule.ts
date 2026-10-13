import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
interface History { lastRunAt?: string }
interface ScheduleConfig { weekday: number; hour: number; timezone: string }

function parts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), weekday };
}

function weekKey(date: Date, timezone: string): string {
  const local = parts(date, timezone);
  const anchor = new Date(Date.UTC(local.year, local.month - 1, local.day));
  anchor.setUTCDate(anchor.getUTCDate() - local.weekday);
  return anchor.toISOString().slice(0, 10);
}

export function nextRunDecision(history: History, now: Date, config: ScheduleConfig): "none" | "scheduled" | "catch-up" {
  if (history.lastRunAt && weekKey(new Date(history.lastRunAt), config.timezone) === weekKey(now, config.timezone)) return "none";
  const local = parts(now, config.timezone);
  if (local.weekday === config.weekday && local.hour === config.hour) return "scheduled";
  const afterDue = local.weekday > config.weekday || (local.weekday === config.weekday && local.hour > config.hour);
  return afterDue ? "catch-up" : "none";
}

type Outcome = { kind: "no-change" | "important-change" | "login-expired" | "approval-required" } | { kind: "failure"; fingerprint: string };
interface NotificationHistory { lastFailureFingerprint?: string; lastFailureNotifiedAt?: string; now?: string }
export function notificationDecision(outcome: Outcome, history: NotificationHistory): "quiet" | "notify" {
  if (outcome.kind === "no-change") return "quiet";
  if (outcome.kind !== "failure") return "notify";
  if (history.lastFailureFingerprint !== outcome.fingerprint || !history.lastFailureNotifiedAt) return "notify";
  const now = new Date(history.now ?? new Date().toISOString()).getTime();
  return now - new Date(history.lastFailureNotifiedAt).getTime() >= 24 * 60 * 60 * 1000 ? "notify" : "quiet";
}

export async function sendNativeNotification(title: string, message: string): Promise<void> {
  const escapedTitle = title.replace(/["\\]/g, "\\$&");
  const escapedMessage = message.replace(/["\\]/g, "\\$&");
  await execFileAsync("osascript", ["-e", `display notification "${escapedMessage}" with title "${escapedTitle}"`]);
}
