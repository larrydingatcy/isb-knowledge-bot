import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { SourceRegistrySchema, type SourceDefinition } from "./schema.js";

export async function loadSourcesFromText(text: string): Promise<SourceDefinition[]> {
  return SourceRegistrySchema.parse(parse(text));
}

export async function loadSources(path: string): Promise<SourceDefinition[]> {
  return loadSourcesFromText(await readFile(path, "utf8"));
}
