import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The frontend build. Deployed to Cloudflare Pages as a static bundle.
 *
 * It carries no credentials and talks to nothing but the API. Where that API
 * lives is the only thing that differs between local and hosted:
 *
 *   local   /__api/* is proxied to the backend on :5175, so the browser sees
 *           one origin and cookies behave the simple way
 *   hosted  VITE_API_URL points at the Railway service, and requests go there
 *           cross-site with credentials — see applyCors in backend/src/api.mjs
 *
 * The proxy is a development convenience only. Nothing in the bundle depends
 * on it, because in production there is no dev server to do the proxying.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      "/__api": {
        target: process.env.VITE_API_URL || "http://127.0.0.1:5175",
        changeOrigin: false,
      },
    },
  },
  preview: { port: 4174 },
  build: { outDir: "dist", sourcemap: false },
});
