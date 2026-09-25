/**
 * The data API.
 *
 * The same handler serves two hosts: the Vite dev server mounts it as
 * middleware for local work, and `server.mjs` wraps it in a standalone Node
 * server for Railway. One set of routes, so the thing that runs in production
 * is the thing that was developed against.
 *
 * Every route needs a session except the three under `auth/`. That check is
 * here rather than in the frontend, because the frontend is a static bundle a
 * person can read and modify.
 */
import * as store from "./store.mjs";
import { paths } from "./paths.mjs";
import { StoreError } from "./store.mjs";
import { describeDatabase } from "./db.mjs";
import {
  authenticate,
  clearedCookie,
  createSession,
  sessionCookie,
  sessionFromRequest,
  usingDefaultCredentials,
} from "./auth.mjs";

/**
 * Postgres errors that mean "the database refused this", not "the server broke".
 * The store checks every rule before writing; these are the second line — a
 * trigger or constraint catching something the store let through.
 */
const DATABASE_REFUSALS = {
  P0001: 409, // raised by a trigger: an issued document is frozen
  23505: 409, // unique: a number already in use
  23514: 422, // check constraint
  23502: 422, // not null
};

const PREFIX = "/__api/";

/** The only routes reachable without a session. */
const PUBLIC_ROUTES = new Set(["auth/login", "auth/session", "auth/logout", "health"]);

class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function handleApiRequest(req, res) {
  if (!req.url?.startsWith(PREFIX)) return false;

  const url = new URL(req.url, "http://localhost");
  const route = url.pathname.slice(PREFIX.length);
  const method = req.method?.toUpperCase() ?? "GET";

  applyCors(req, res);
  // The browser asks permission before a cross-site request with credentials.
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    const session = sessionFromRequest(req);
    if (!PUBLIC_ROUTES.has(route) && !session) {
      throw new AuthError("Not signed in.");
    }

    const body = method === "GET" || method === "DELETE" ? null : await readBody(req);
    const result = await dispatch(route, method, body, url, { req, res, session });
    send(res, 200, result);
  } catch (error) {
    const status =
      error instanceof StoreError || error instanceof AuthError ? error.status : DATABASE_REFUSALS[error.code] ?? 500;
    if (status >= 500) console.error(`[jura-api] ${method} ${route}:`, error);
    send(res, status, {
      error: error.message,
      code: error.code ?? error.name ?? "Error",
      details: error.details ?? null,
    });
  }
  return true;
}

/**
 * Hosted, the frontend is on Cloudflare Pages and this is on Railway, so every
 * request is cross-site and carries a cookie. That combination requires naming
 * the exact origin — `*` is not allowed with credentials — which is why
 * ALLOWED_ORIGIN has to be set in the Railway environment.
 */
function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers?.origin;
  if (!origin) return;

  // In development the Vite proxy makes this same-origin, so anything on
  // localhost is fine. In production only the configured origins are.
  const permitted =
    allowed.includes(origin) ||
    (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  if (!permitted) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

async function dispatch(route, method, body, url, ctx) {
  const parts = route.split("/").filter(Boolean);

  // GET /__api/health — for Railway's health check. Says nothing about the data.
  if (parts[0] === "health" && method === "GET") {
    return { ok: true, service: "jura-invoicing", time: new Date().toISOString() };
  }

  // ---------------------------------------------------------------- auth

  if (parts[0] === "auth") {
    if (parts[1] === "login" && method === "POST") {
      const user = await authenticate(body?.username, body?.password);
      if (!user) {
        // Deliberately vague: saying which half was wrong tells an attacker
        // whether the username exists.
        throw new AuthError("That username and password do not match.");
      }
      const token = createSession(user);
      ctx.res.setHeader("Set-Cookie", sessionCookie(token));
      return { user, token, using_default_credentials: await usingDefaultCredentials() };
    }

    if (parts[1] === "logout" && method === "POST") {
      ctx.res.setHeader("Set-Cookie", clearedCookie());
      return { ok: true };
    }

    if (parts[1] === "session" && method === "GET") {
      if (!ctx.session) throw new AuthError("Not signed in.");
      return {
        user: ctx.session.user,
        expires_at: ctx.session.expires_at,
        using_default_credentials: await usingDefaultCredentials(),
      };
    }
  }

  // GET /__api/bootstrap — everything the app needs to start.
  if (parts[0] === "bootstrap" && method === "GET") {
    const [config, clients, templates, documents] = await Promise.all([
      store.readConfig(),
      store.readClients(),
      store.listTemplates(),
      store.listDocuments(),
    ]);
    return { config, clients, templates, documents, paths: { data: await describeDatabase(), outputs: paths.outputs } };
  }

  if (parts[0] === "config") {
    if (method === "GET") return store.readConfig();
    if (method === "PUT") return store.writeConfig(body);
  }

  if (parts[0] === "clients") {
    if (method === "GET") return store.readClients();
    if (method === "POST") return store.upsertClient(body);
    if (parts[1] && method === "DELETE") {
      await store.deleteClient(parts[1]);
      return { ok: true };
    }
  }

  if (parts[0] === "templates") {
    if (method === "GET") return store.listTemplates();
    if (method === "POST") return store.saveTemplate(body);
    if (parts[1] && method === "DELETE") {
      await store.deleteTemplate(parts[1]);
      return { ok: true };
    }
  }

  if (parts[0] === "documents") {
    // /documents
    if (parts.length === 1) {
      if (method === "GET") return store.listDocuments();
      if (method === "POST") return store.createDocument(body ?? {});
    }

    const id = parts[1];

    // /documents/by-number/JURA-2026-09-001
    if (id === "by-number" && parts[2] && method === "GET") {
      return store.findByNumber(decodeURIComponent(parts.slice(2).join("/")));
    }

    // /documents/:id
    if (parts.length === 2) {
      if (method === "GET") return store.readDocument(id);
      if (method === "PUT") return store.saveDocument(id, body);
      if (method === "DELETE") {
        await store.deleteDocument(id);
        return { ok: true };
      }
    }

    // /documents/:id/<action>
    const action = parts[2];
    if (parts.length === 3 && method === "POST") {
      switch (action) {
        case "issue": return store.issueDocument(id, body ?? {});
        case "status": return store.setStatus(id, body?.status, { reason: body?.reason });
        case "payments": return store.recordPayment(id, body ?? {});
        case "receipt": return store.receiptFromInvoice(id);
        case "convert": return store.invoiceFromQuotation(id);
        case "credit-note": return store.creditNoteFrom(id, body ?? {});
      }
    }
    if (parts.length === 4 && parts[2] === "payments" && method === "DELETE") {
      return store.removePayment(id, parts[3]);
    }
  }

  throw new StoreError(`No route for ${method} /${route}${url.search}`, 404);
}

function send(res, status, payload) {
  const text = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      // A document with a megabyte of line items is a mistake, not a document.
      if (size > 4 * 1024 * 1024) {
        reject(new StoreError("Request body too large.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new StoreError(`Request body is not valid JSON: ${error.message}`, 400));
      }
    });
    req.on("error", reject);
  });
}
