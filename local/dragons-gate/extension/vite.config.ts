import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { parse } from "yaml";

const connectorConfig = parse(await readFile(resolve("../config.yml"), "utf8")) as { allowedHosts: string[]; startUrls: string[]; receiverUrl: string; schedule: { weekday: string; hour: number; timezone: string } };

export default defineConfig({
  define: { __DG_CONFIG__: JSON.stringify(connectorConfig) },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { background: resolve("src/background.ts"), content: resolve("src/content.ts"), popup: resolve("src/popup.html") },
      output: { entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" }
    }
  },
  plugins: [{
    name: "copy-manifest",
    async closeBundle() {
      await mkdir("dist", { recursive: true });
      const manifest = JSON.parse(await readFile("manifest.json", "utf8")) as Record<string, unknown>;
      const siteOrigins = connectorConfig.allowedHosts.map((host) => `https://${host}/*`);
      manifest.optional_host_permissions = [...siteOrigins, `${new URL(connectorConfig.receiverUrl).origin}/*`];
      manifest.content_scripts = [{ matches: siteOrigins, js: ["content.js"], run_at: "document_idle" }];
      await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await copyFile("dist/src/popup.html", "dist/popup.html");
    }
  }]
});
