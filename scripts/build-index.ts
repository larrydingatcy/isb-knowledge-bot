import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildSearchIndex } from "../packages/knowledge/src/index.js";
import { parsePublicKnowledge } from "../packages/knowledge/src/schema.js";

const itemsPath = resolve("data/knowledge/items.json");
const indexPath = resolve("data/knowledge/search-index.json");
const items = parsePublicKnowledge(JSON.parse(await readFile(itemsPath, "utf8")));
const serialized = buildSearchIndex(items);

await writeFile(indexPath, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
