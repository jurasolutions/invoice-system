/**
 * A throwaway server for the tools that need to render a document.
 *
 * The export and the layout check both need the frontend and the API in one
 * place, driven by headless Chromium. Rather than making the operator start
 * both halves first, this stands up a Vite dev server for the frontend and
 * mounts the API into it directly.
 *
 * The frontend's own config proxies `/__api` to :5175 for normal development.
 * That proxy is switched off here — there is nothing on :5175 during a
 * `npm run export`, and the API is being served from inside this process.
 *
 * Authentication still applies. These tools do not get a bypass; they mint a
 * real session and send it as a bearer token, which works because the API they
 * are talking to is running in this same process and signs with the same key.
 */
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { handleApiRequest } from "../backend/src/api.mjs";
import { ensureDataTree } from "../backend/src/store.mjs";
import { createSession, username } from "../backend/src/auth.mjs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
export const frontendRoot = resolve(toolsDir, "../frontend");

function inlineApi() {
  return {
    name: "jura-inline-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) next();
      });
    },
  };
}

/**
 * @returns {{ url: string, headers: Record<string,string>, close: () => Promise<void> }}
 */
export async function startPreview() {
  await ensureDataTree();

  const server = await createServer({
    root: frontendRoot,
    configFile: join(frontendRoot, "vite.config.mjs"),
    plugins: [inlineApi()],
    // Serve the API from here rather than proxying it somewhere that is not running.
    server: { port: 0, host: "127.0.0.1", proxy: {} },
    logLevel: "error",
  });
  await server.listen();

  const url = (server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`).replace(/\/$/, "");

  return {
    url,
    headers: { Authorization: `Bearer ${createSession(username())}` },
    close: () => server.close(),
  };
}
