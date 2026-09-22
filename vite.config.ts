import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    watch: {
      // Ignore editor/tool temp files (e.g. image editors saving into src/icons)
      // and build archives (e.g. a zipped dist/ output) so a file locked by another
      // process (antivirus, archiver, Explorer) can't crash the dev server's watcher.
      ignored: ["**/*.~tmp", "**/*.tmp", "**/*.zip", "**/dist/**"],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
});
