import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("../../data/knowledge");
const destination = resolve("public/knowledge");

await mkdir(destination, { recursive: true });
for (const file of ["items.json", "manifest.json"]) {
  await cp(resolve(source, file), resolve(destination, file));
}
