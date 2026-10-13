import { z } from "zod";

import {
  KnowledgeManifestSchema,
  parsePublicKnowledge,
  type KnowledgeItem,
  type KnowledgeManifest
} from "./schema.js";

export interface KnowledgeDocumentV1 {
  schemaVersion: 1;
  items: KnowledgeItem[];
  manifest: KnowledgeManifest;
}

export function migrateKnowledgeDocument(input: unknown): KnowledgeDocumentV1 {
  const version = z.object({ schemaVersion: z.number().int() }).parse(input).schemaVersion;
  if (version !== 1) {
    throw new Error(`Unsupported schema version: ${version}`);
  }

  const document = z
    .object({
      schemaVersion: z.literal(1),
      items: z.unknown(),
      manifest: KnowledgeManifestSchema
    })
    .parse(input);
  const items = parsePublicKnowledge(document.items);

  if (document.manifest.itemCount !== items.length) {
    throw new Error("Manifest item count does not match knowledge items");
  }

  return { ...document, items };
}
