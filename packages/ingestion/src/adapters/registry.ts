import { htmlAdapter } from "./html.js";
import { sitemapAdapter } from "./sitemap.js";
import type { SourceAdapter } from "./types.js";

export function createAdapter(name: "html" | "sitemap"): SourceAdapter {
  if (name === "html") return htmlAdapter;
  if (name === "sitemap") return sitemapAdapter;
  throw new Error(`Unknown adapter: ${String(name)}`);
}
