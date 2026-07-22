import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = `http://127.0.0.1:${process.env.JARVIS_API_PORT ?? "3000"}`;

export default defineConfig({
  plugins: [react()],
  define: { __JARVIS_BUILD_ID__: JSON.stringify(process.env.JARVIS_BUILD_ID ?? "development") },
  build: { outDir: "dist/client", emptyOutDir: false },
  server: { host: "127.0.0.1", port: 4173, proxy: { "/api": apiTarget } },
  preview: { host: "127.0.0.1", port: 4173, proxy: { "/api": apiTarget } },
});
