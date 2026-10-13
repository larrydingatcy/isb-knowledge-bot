import { z } from "zod";

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const KnowledgeItemSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.enum(["zh", "en"]),
  category: z.string().min(1),
  tags: z.array(z.string().min(1)),
  sourceId: z.string().min(1),
  sourceUrl: z.url().refine((url) => new URL(url).protocol === "https:", {
    message: "sourceUrl must use HTTPS"
  }),
  sourceType: z.enum(["official-web", "official-document", "dragons-gate"]),
  publishedAt: IsoDateTimeSchema,
  validFrom: IsoDateTimeSchema,
  validUntil: IsoDateTimeSchema,
  crawledAt: IsoDateTimeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  upstreamVersion: z.string().min(1),
  visibility: z.literal("public"),
  reviewStatus: z.enum(["approved", "auto-published"]),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  translationId: z.string().min(1).optional()
});

export const KnowledgeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  indexVersion: z.string().min(1),
  generatedAt: IsoDateTimeSchema,
  itemCount: z.number().int().nonnegative(),
  sourceFreshness: z.array(
    z.object({
      sourceId: z.string().min(1),
      lastSuccessfulAt: IsoDateTimeSchema,
      status: z.enum(["current", "stale", "failed"])
    })
  )
});

export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export type KnowledgeManifest = z.infer<typeof KnowledgeManifestSchema>;

export function parsePublicKnowledge(input: unknown): KnowledgeItem[] {
  return z.array(KnowledgeItemSchema).parse(input);
}
