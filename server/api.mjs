/**
 * The local data API.
 *
 * This is not a backend in the sense the word usually carries. It runs inside
 * the Vite dev server, on this machine, bound to localhost, with no auth and
 * no network exposure — because the alternative is a browser app that cannot
 * write a file, and the records have to be real JSON files on disk that
 * survive the app being uninstalled.
 *
 * Nothing here reaches the network. No connectors, no external service.
 */
import * as store from "./store.mjs";
import { paths } from "./paths.mjs";
import { StoreError } from "./store.mjs";

const PREFIX = "/__api/";

export async function handleApiRequest(req, res) {
  if (!req.url?.startsWith(PREFIX)) return false;

  const url = new URL(req.url, "http://localhost");
  const route = url.pathname.slice(PREFIX.length);
  const method = req.method?.toUpperCase() ?? "GET";

  try {
    const body = method === "GET" || method === "DELETE" ? null : await readBody(req);
    const result = await dispatch(route, method, body, url);
    send(res, 200, result);
  } catch (error) {
    const status = error instanceof StoreError ? error.status : 500;
    if (status >= 500) console.error(`[jura-api] ${method} ${route}:`, error);
    send(res, status, {
      error: error.message,
      code: error.code ?? error.name ?? "Error",
      details: error.details ?? null,
    });
  }
  return true;
}

async function dispatch(route, method, body, url) {
  const parts = route.split("/").filter(Boolean);

  // GET /__api/bootstrap — everything the app needs to start.
  if (parts[0] === "bootstrap" && method === "GET") {
    const [config, clients, templates, documents] = await Promise.all([
      store.readConfig(),
      store.readClients(),
      store.listTemplates(),
      store.listDocuments(),
    ]);
    return { config, clients, templates, documents, paths: { data: paths.root, outputs: paths.outputs } };
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
