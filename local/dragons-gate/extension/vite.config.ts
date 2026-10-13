import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
      await copyFile("manifest.json", "dist/manifest.json");
      await copyFile("dist/src/popup.html", "dist/popup.html");
    }
  }]
});
