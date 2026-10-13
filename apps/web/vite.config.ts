import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/isb-knowledge-bot/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
