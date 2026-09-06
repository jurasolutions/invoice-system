import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { handleApiRequest } from "./server/api.mjs";
import { ensureDataTree } from "./server/store.mjs";
import { paths, dataRoot, outputRoot } from "./server/paths.mjs";

/**
 * Serves the local data API alongside the app.
 *
 * The app has to read and write real JSON files — a browser cannot, and the
 * records need to outlive the browser's storage. This middleware is the
 * shortest path to that: localhost only, no auth, no network calls, running
 * only while `npm run dev` is running.
 */
function juraDataApi() {
  return {
    name: "jura-data-api",
    async configureServer(server) {
      await ensureDataTree();
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) next();
      });
      // Say where the data went. There should never be a question about which
      // folder a document was written to.
      server.httpServer?.once("listening", () => {
        server.config.logger.info(`\n  jura data    ${dataRoot}`);
        server.config.logger.info(`  jura output  ${outputRoot}\n`);
      });
    },
    async configurePreviewServer(server) {
      await ensureDataTree();
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), juraDataApi()],
  server: { port: 5174, strictPort: false },
  preview: { port: 4174 },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
  },
});

export { paths };
