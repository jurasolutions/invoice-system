/**
 * The API as a standalone server. This is what runs on Railway.
 *
 * It is a thin wrapper: every route lives in `api.mjs`, which the Vite dev
 * server also mounts as middleware. One set of handlers, so what is developed
 * against locally is what runs in production.
 *
 * `node:http` rather than a framework, because the whole surface is one
 * `handleApiRequest` call and a health check. A framework would be four
 * dependencies for routing that already exists.
 */
import { createServer } from "node:http";

import { handleApiRequest } from "./api.mjs";
import { ensureDatabase } from "./store.mjs";
import { assertProductionReady, ensureAdminUser, usingDefaultCredentials } from "./auth.mjs";
import { closeDatabase, describeDatabase } from "./db.mjs";
import { outputRoot } from "./paths.mjs";

const PORT = Number(process.env.PORT ?? 5175);
const HOST = process.env.HOST ?? "0.0.0.0";

// Refuses to start a public server on the default password that is published
// in this repo. See auth.mjs.
assertProductionReady();

// Migrations, default settings and templates, then the admin user. Nothing
// is served until the database is ready.
await ensureDatabase();
await ensureAdminUser();
const database = await describeDatabase();

const server = createServer(async (req, res) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (handled) return;

    // Anything that is not the API. The frontend is served by Cloudflare
    // Pages, not from here, so there is nothing else to give.
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: `No route for ${req.method} ${req.url}` }));
  } catch (error) {
    console.error("[jura-api] unhandled:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Internal error" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`\n  jura api     http://${HOST}:${PORT}`);
  console.log(`  jura data    ${database}`);
  console.log(`  jura output  ${outputRoot}`);
  if (await usingDefaultCredentials()) {
    console.log(`\n  Signing in with the default credentials (admin / P@ssw0rd).`);
    console.log(`  Set ADMIN_PASSWORD_HASH before this is reachable from anywhere else.`);
  }
  console.log("");
});

// Railway sends SIGTERM on redeploy. Finish in-flight requests rather than
// dropping them — one of them might be assigning an invoice number.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`\n${signal} — closing`);
    server.close(() => closeDatabase().finally(() => process.exit(0)));
    // If a connection will not drain, do not hang the deploy forever.
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
