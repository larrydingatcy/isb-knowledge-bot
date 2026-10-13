import ipaddr from "ipaddr.js";
import type { SourceDefinition } from "./schema.js";

export type ResolveDns = (hostname: string) => Promise<string[]>;

const blockedRanges = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "private",
  "uniqueLocal",
  "carrierGradeNat",
  "reserved"
]);

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function assertPublicAddress(address: string): void {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.process(address);
  } catch {
    throw new Error(`DNS returned an invalid address: ${address}`);
  }
  if (blockedRanges.has(parsed.range())) throw new Error(`Blocked non-public address range: ${parsed.range()}`);
}

export async function assertSafeSourceUrl(url: URL, source: SourceDefinition, resolveDns: ResolveDns): Promise<void> {
  if (url.protocol !== "https:") throw new Error("Only HTTPS source URLs are allowed");
  if (url.username || url.password) throw new Error("Credentials are not allowed in source URLs");
  const hostname = normalizedHostname(url);
  if (!source.allowedHosts.includes(hostname)) throw new Error(`Host is not allowlisted: ${hostname}`);

  const addresses = ipaddr.isValid(hostname) ? [hostname] : await resolveDns(hostname);
  if (addresses.length === 0) throw new Error(`No DNS answers for ${hostname}`);
  for (const address of addresses) assertPublicAddress(address);
}
