/**
 * Talking to the API.
 *
 * Locally the Vite dev server proxies `/__api` to the backend on :5175, so
 * this is a same-origin request. Hosted, `VITE_API_URL` points at the Railway
 * service and it is cross-site — which is why every request sends credentials,
 * and why the API has to name this exact origin in its CORS headers.
 *
 * The session lives in an HttpOnly cookie, so there is no token to hold here
 * and nothing for a script on the page to read.
 */

// Set at build time. Empty locally, where the dev server proxies instead.
const API_ORIGIN = (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");
const BASE = `${API_ORIGIN}/__api`;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }

  /** A session that has expired or was never there. */
  get isAuth() {
    return this.status === 401;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // The session cookie is cross-site once this is hosted, so it only
      // travels if it is asked for explicitly.
      credentials: "include",
    });
  } catch (error) {
    throw new ApiError(
      API_ORIGIN
        ? `Cannot reach the API at ${API_ORIGIN}. It may be starting up, or the address may be wrong.`
        : "Cannot reach the API. Start it with `npm run dev`.",
      0,
      { cause: String(error) }
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(`The server sent something that is not JSON (${response.status}).`, response.status);
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status, payload?.details);
  }
  return payload;
}

export const api = {
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),
  logout: () => request("/auth/logout", { method: "POST", body: {} }),
  session: () => request("/auth/session"),

  bootstrap: () => request("/bootstrap"),

  readConfig: () => request("/config"),
  writeConfig: (config) => request("/config", { method: "PUT", body: config }),

  listClients: () => request("/clients"),
  saveClient: (client) => request("/clients", { method: "POST", body: client }),
  deleteClient: (id) => request(`/clients/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listTemplates: () => request("/templates"),
  saveTemplate: (template) => request("/templates", { method: "POST", body: template }),
  deleteTemplate: (slug) => request(`/templates/${encodeURIComponent(slug)}`, { method: "DELETE" }),

  listDocuments: () => request("/documents"),
  readDocument: (id) => request(`/documents/${encodeURIComponent(id)}`),
  readByNumber: (number) => request(`/documents/by-number/${encodeURIComponent(number)}`),
  createDocument: (payload) => request("/documents", { method: "POST", body: payload }),
  saveDocument: (id, doc) => request(`/documents/${encodeURIComponent(id)}`, { method: "PUT", body: doc }),
  deleteDocument: (id) => request(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),

  issue: (id, payload = {}) => request(`/documents/${encodeURIComponent(id)}/issue`, { method: "POST", body: payload }),
  setStatus: (id, status, reason) =>
    request(`/documents/${encodeURIComponent(id)}/status`, { method: "POST", body: { status, reason } }),
  addPayment: (id, payment) => request(`/documents/${encodeURIComponent(id)}/payments`, { method: "POST", body: payment }),
  removePayment: (id, paymentId) =>
    request(`/documents/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`, { method: "DELETE" }),
  makeReceipt: (id) => request(`/documents/${encodeURIComponent(id)}/receipt`, { method: "POST", body: {} }),
  convert: (id) => request(`/documents/${encodeURIComponent(id)}/convert`, { method: "POST", body: {} }),
  creditNote: (id, reason) => request(`/documents/${encodeURIComponent(id)}/credit-note`, { method: "POST", body: { reason } }),
};
