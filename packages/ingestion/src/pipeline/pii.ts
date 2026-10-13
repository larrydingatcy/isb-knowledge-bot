export interface PiiFinding { kind: string; match: string }

const patterns: Array<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["phone", /(?:\+?86[-\s]?)?1[3-9]\d{9}\b|\b\+?\d[\d\s()-]{8,}\d\b/],
  ["student-id", /\b(?:student\s*(?:id|number)|学号)\s*[:#：]?\s*[A-Z0-9-]{4,}\b/i],
  ["account-balance", /\b(?:account\s+balance|meal\s+balance|余额)\b/i]
];

export function findPii(text: string): PiiFinding[] {
  return patterns.flatMap(([kind, pattern]) => {
    const match = text.match(pattern);
    return match ? [{ kind, match: match[0] }] : [];
  });
}
