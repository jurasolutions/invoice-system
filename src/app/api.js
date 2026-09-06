/**
 * Talking to the local data API.
 *
 * Every call goes to this machine. If one of these ever fails with a network
 * error it means `npm run dev` is not running, not that something is down —
 * so that is what the error says.
 */

const BASE = "/__api";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(
      "Cannot reach the local data API. This app only works while `npm run dev` is running.",
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
