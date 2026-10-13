import { z } from "zod";

const HttpsUrl = z.url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS");
const Hostname = z.string().min(1).transform((host) => host.toLowerCase().replace(/\.$/, ""));

export const SourceDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  baseUrl: HttpsUrl,
  startUrls: z.array(HttpsUrl).min(1),
  allowedHosts: z.array(Hostname).min(1),
  adapter: z.enum(["html", "sitemap"]),
  languages: z.array(z.enum(["en", "zh"])).min(1),
  categories: z.array(z.string().min(1)).min(1),
  crawlIntervalHours: z.number().positive(),
  maxPages: z.number().int().positive(),
  requestDelayMs: z.number().int().nonnegative(),
  visibilityPolicy: z.enum(["public", "review-required"])
}).superRefine((source, context) => {
  const allowed = new Set(source.allowedHosts);
  for (const value of [source.baseUrl, ...source.startUrls]) {
    if (!allowed.has(new URL(value).hostname.toLowerCase().replace(/\.$/, ""))) {
      context.addIssue({ code: "custom", message: `URL host is not allowlisted: ${value}` });
    }
  }
});

export const SourceRegistrySchema = z.array(SourceDefinitionSchema).min(1).superRefine((sources, context) => {
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source.id)) context.addIssue({ code: "custom", message: `Duplicate source id: ${source.id}` });
    seen.add(source.id);
  }
});

export type SourceDefinition = z.infer<typeof SourceDefinitionSchema>;
