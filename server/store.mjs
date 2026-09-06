/**
 * The store: everything that reads or writes `data/invoices/`.
 *
 * This is the only place that touches the filesystem, and it is where the two
 * rules that make the records worth keeping are actually enforced:
 *
 *   - a number is assigned once, atomically, and never reused
 *   - an issued document's content is frozen
 *
 * The builder enforces both in the UI as well, but the UI is a convenience.
 * If the rule is not held here it is not held at all.
 */
import { readdir, mkdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { paths } from "./paths.mjs";
import { readJson, writeJsonAtomic, withLock } from "./atomic.mjs";
import { emptyCounters, nextNumber, validateCounters, parseNumber } from "../src/domain/numbering.js";
import {
  computeTotals,
  frozenFieldsTouched,
  isIssued,
  validateForIssue,
  canTransition,
  MUTABLE_AFTER_ISSUE,
  blankDocument,
  snapshotClient,
  SCHEMA_VERSION,
} from "../src/domain/document.js";
import { today } from "../src/domain/dates.js";
import { isSafeId, slugify, newDocumentId, newPaymentId, newSectionId, newItemId } from "../src/domain/ids.js";

export class StoreError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "StoreError";
    this.status = status;
    this.details = details;
  }
}

// ------------------------------------------------------------------- config

export async function readConfig() {
  const config = await readJson(paths.config, null);
  if (!config) {
    throw new StoreError(
      `No config.json at ${paths.config}. Run \`npm run seed\` to create the data tree.`,
      503
    );
  }
  return config;
}

export async function writeConfig(config) {
  return writeJsonAtomic(paths.config, config);
}

// ------------------------------------------------------------------ clients

export async function readClients() {
  return readJson(paths.clients, []);
}

export async function upsertClient(client) {
  const clients = await readClients();
  const index = clients.findIndex((c) => c.id === client.id);
  const record = { ...client, updated_at: new Date().toISOString() };
  if (index === -1) clients.push({ ...record, created_at: record.updated_at });
  else clients[index] = { ...clients[index], ...record };
  await writeJsonAtomic(paths.clients, clients);
  return record;
}

export async function deleteClient(id) {
  const clients = await readClients();
  const remaining = clients.filter((c) => c.id !== id);
  if (remaining.length === clients.length) throw new StoreError(`No client ${id}`, 404);
  await writeJsonAtomic(paths.clients, remaining);
}

// ---------------------------------------------------------------- templates

export async function listTemplates() {
  let files;
  try {
    files = await readdir(paths.templates);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const templates = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const template = await readJson(join(paths.templates, file), null);
    if (template) templates.push({ ...template, slug: file.replace(/\.json$/, "") });
  }
  return templates.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}

export async function saveTemplate(template) {
  const slug = slugify(template.slug || template.name);
  if (!isSafeId(slug)) throw new StoreError(`Bad template name: ${template.name}`, 400);
  const path = join(paths.templates, `${slug}.json`);
  const record = {
    name: template.name,
    description: template.description ?? "",
    document_type: template.document_type ?? "invoice",
    terms_days: template.terms_days ?? null,
    panels: template.panels ?? null,
    notes: template.notes ?? "",
    sections: template.sections ?? [],
    adjustments: template.adjustments ?? [],
    order: template.order ?? 50,
    updated_at: new Date().toISOString(),
  };
  await writeJsonAtomic(path, record);
  return { ...record, slug };
}

export async function deleteTemplate(slug) {
  if (!isSafeId(slug)) throw new StoreError(`Bad template slug: ${slug}`, 400);
  await rm(join(paths.templates, `${slug}.json`), { force: true });
}

// ---------------------------------------------------------------- documents

function documentPath(id) {
  if (!isSafeId(id)) throw new StoreError(`Bad document id: ${id}`, 400);
  const path = resolve(paths.documents, `${id}.json`);
  // Belt and braces against a crafted id climbing out of the documents folder.
  if (!path.startsWith(resolve(paths.documents))) throw new StoreError(`Bad document id: ${id}`, 400);
  return path;
}

export async function readDocument(id) {
  const doc = await readJson(documentPath(id), null);
  if (!doc) throw new StoreError(`No document ${id}`, 404);
  return doc;
}

export async function listDocuments() {
  let files;
  try {
    files = await readdir(paths.documents);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const summaries = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const doc = await readJson(join(paths.documents, file), null);
    if (doc) summaries.push(summarise(doc));
  }
  // Newest first: issued documents by number within a period, drafts by when
  // they were last touched.
  return summaries.sort((a, b) => (b.sort_key > a.sort_key ? 1 : b.sort_key < a.sort_key ? -1 : 0));
}

export function summarise(doc) {
  const totals = computeTotals(doc);
  return {
    id: doc.id,
    type: doc.type,
    number: doc.number,
    status: doc.status,
    issued_at: doc.issued_at,
    due_date: doc.due_date ?? null,
    valid_until: doc.valid_until ?? null,
    client_name: doc.client_snapshot?.name ?? "",
    reference: doc.reference ?? "",
    currency: doc.currency ?? "SGD",
    specimen: Boolean(doc.specimen),
    amount_due_cents: totals.amount_due_cents,
    balance_cents: totals.balance_cents,
    net_total_cents: totals.net_total_cents,
    links: doc.links ?? {},
    updated_at: doc.updated_at,
    sort_key: doc.number ?? `~draft-${doc.updated_at ?? doc.created_at ?? ""}`,
  };
}

export async function createDocument({ type, template, client_id, from }) {
  const config = await readConfig();
  const doc = blankDocument(type, config);

  if (client_id) {
    const clients = await readClients();
    const client = clients.find((c) => c.id === client_id);
    if (!client) throw new StoreError(`No client ${client_id}`, 404);
    doc.client_id = client.id;
    doc.client_snapshot = snapshotClient(client);
  }

  if (template) {
    applyTemplate(doc, template, config);
  }

  if (from) {
    Object.assign(doc, from, { id: doc.id, number: null, status: "draft", created_at: doc.created_at });
  }

  await writeDocument(doc);
  return doc;
}

/**
 * Fill a draft from a template.
 *
 * Deep-copied with fresh ids on every section and item. A template is a
 * starting point, not a live link: editing the draft afterwards must never
 * write back through to the template file.
 */
export function applyTemplate(doc, template, config) {
  doc.sections = (template.sections ?? []).map((section) => ({
    id: undefined,
    title: section.title ?? "",
    meta: section.meta ?? "",
    items: (section.items ?? []).map((item) => ({
      id: undefined,
      description: item.description ?? "",
      note: item.note ?? "",
      qty: item.qty ?? 1,
      unit_price_cents: item.unit_price_cents ?? null,
    })),
  }));
  // Fresh ids, assigned after the copy so nothing is shared with the template.
  for (const section of doc.sections) {
    section.id = newSectionId();
    for (const item of section.items) item.id = newItemId();
  }
  if (template.panels) doc.panels = [...template.panels];
  if (template.notes) doc.notes = template.notes;
  if (template.terms_days != null && doc.type === "invoice") {
    doc.terms_days = template.terms_days;
    doc.due_date = addDaysISO(doc.issued_at, template.terms_days);
  }
  doc.template_slug = template.slug ?? null;
  return doc;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function writeDocument(doc) {
  await mkdir(paths.documents, { recursive: true });
  return writeJsonAtomic(documentPath(doc.id), doc);
}

/**
 * Save a document.
 *
 * A draft saves wholesale. An issued document only accepts changes to the
 * fields that record what happened to it after it went out — anything else is
 * refused, by name, so the caller knows exactly what it tried to change.
 */
export async function saveDocument(id, incoming) {
  const existing = await readDocument(id);

  if (isIssued(existing)) {
    const frozen = frozenFieldsTouched(existing, { ...existing, ...incoming });
    if (frozen.length > 0) {
      throw new StoreError(
        `${existing.number} has been issued, so its content cannot be changed. ` +
          `Refused changes to: ${frozen.join(", ")}. Raise a credit note instead.`,
        409,
        { frozen }
      );
    }
    const merged = {
      ...existing,
      ...pick(incoming, [...MUTABLE_AFTER_ISSUE]),
      updated_at: new Date().toISOString(),
    };
    await writeDocument(merged);
    return merged;
  }

  const merged = {
    ...existing,
    ...incoming,
    id: existing.id,
    number: existing.number,
    created_at: existing.created_at,
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
  };
  await writeDocument(merged);
  return merged;
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));
}

export async function deleteDocument(id) {
  const doc = await readDocument(id);
  if (isIssued(doc)) {
    throw new StoreError(
      `${doc.number} has been issued and cannot be deleted. Void it instead — the number stays in the sequence.`,
      409
    );
  }
  await rm(documentPath(id), { force: true });
}

// ----------------------------------------------------------------- numbering

export async function readCounters() {
  const counters = await readJson(paths.counters, null);
  if (!counters) {
    throw new StoreError(
      `No counters.json at ${paths.counters}. Run \`npm run seed\`. Refusing to issue without one — ` +
        "starting a fresh sequence over an existing one would produce duplicate numbers.",
      503
    );
  }
  const problems = validateCounters(counters);
  if (problems.length > 0) {
    throw new StoreError(
      `counters.json is not usable and no number has been assigned: ${problems.join("; ")}. ` +
        "Fix the file by hand — the next number must continue the existing sequence, not restart it.",
      500,
      { problems }
    );
  }
  return counters;
}

/**
 * Issue a document: assign its number and lock its content.
 *
 * The whole thing runs inside the counter lock, and the counter is written
 * before the document. If the process dies between the two writes the counter
 * has advanced but no document claims that number — a gap, which is visible
 * and explicable. The other order would produce two documents with the same
 * number, which is neither.
 */
export async function issueDocument(id, { issued_at } = {}) {
  const config = await readConfig();

  return withLock(paths.countersLock, async () => {
    const doc = await readDocument(id);
    if (doc.number) throw new StoreError(`Already issued as ${doc.number}.`, 409);

    if (issued_at) doc.issued_at = issued_at;

    const problems = validateForIssue(doc, config);
    if (problems.length > 0) {
      throw new StoreError(`This document is not ready to issue: ${problems.join(" ")}`, 422, { problems });
    }

    const counters = await readCounters();
    const assigned = nextNumber(counters, doc.type, doc.issued_at);

    await writeJsonAtomic(paths.counters, assigned.counters);

    const issued = {
      ...doc,
      number: assigned.number,
      status: "issued",
      issued_at: doc.issued_at,
      company_snapshot: snapshotCompany(config),
      updated_at: new Date().toISOString(),
    };
    await writeDocument(issued);

    // A receipt or credit note points back at the document it settles or
    // corrects; write the return link now that both have numbers.
    await backlink(issued);

    return issued;
  });
}

/**
 * The company's own details, frozen onto the document at issue.
 *
 * Same reasoning as the client snapshot. When Jura's UEN placeholder is
 * replaced with the real one, or the registered address changes, documents
 * already sent must keep saying what they said.
 */
function snapshotCompany(config) {
  return {
    legal_name: config.company?.legal_name ?? "",
    uen: config.company?.uen ?? "",
    uen_confirmed: config.company?.uen_confirmed ?? false,
    address_lines: [...(config.company?.address_lines ?? [])],
    address_confirmed: config.company?.address_confirmed ?? false,
    email: config.company?.email ?? "",
    website: config.company?.website ?? "",
    tagline: config.company?.tagline ?? "",
  };
}

async function backlink(doc) {
  const targetId = doc.links?.invoice_id ?? doc.links?.corrects_id ?? null;
  if (!targetId || targetId === doc.id) return;
  let target;
  try {
    target = await readDocument(targetId);
  } catch {
    return;
  }
  const links = { ...(target.links ?? {}) };
  if (doc.type === "receipt") {
    links.receipt_ids = [...new Set([...(links.receipt_ids ?? []), doc.id])];
  } else if (doc.type === "credit_note") {
    links.credit_note_ids = [...new Set([...(links.credit_note_ids ?? []), doc.id])];
  } else if (doc.type === "invoice") {
    links.invoice_id = doc.id;
  }
  await writeDocument({ ...target, links, updated_at: new Date().toISOString() });
}

// ------------------------------------------------------------------ lifecycle

export async function setStatus(id, next, { reason } = {}) {
  const doc = await readDocument(id);
  if (!canTransition(doc, next)) {
    throw new StoreError(`A ${doc.type} that is ${doc.status} cannot become ${next}.`, 409);
  }
  const stamps = {
    sent: { sent_at: today() },
    paid: { paid_at: today() },
    accepted: { accepted_at: today() },
    void: { voided_at: today(), void_reason: reason ?? "" },
  };
  const updated = { ...doc, status: next, ...(stamps[next] ?? {}), updated_at: new Date().toISOString() };
  await writeDocument(updated);
  return updated;
}

/**
 * Record a payment against an issued invoice.
 *
 * Payments are one of the few things allowed to change after issue: the
 * invoice's content is fixed, but what the client has since paid against it is
 * not part of that content.
 */
export async function recordPayment(id, payment) {
  const doc = await readDocument(id);
  if (doc.type !== "invoice") throw new StoreError("Payments are recorded against invoices.", 400);
  if (!doc.number) throw new StoreError("Issue the invoice before recording a payment against it.", 409);
  if (doc.status === "void") throw new StoreError(`${doc.number} is void.`, 409);

  const record = {
    id: payment.id ?? newPaymentId(),
    date: payment.date ?? today(),
    method: payment.method ?? "Bank transfer",
    reference: payment.reference ?? doc.number,
    applied_to: payment.applied_to ?? "Balance",
    amount_cents: payment.amount_cents ?? 0,
    note: payment.note ?? "",
  };
  if (!Number.isSafeInteger(record.amount_cents) || record.amount_cents === 0) {
    throw new StoreError("A payment needs a non-zero amount in whole cents.", 400);
  }

  const payments = [...(doc.payments ?? []), record].sort((a, b) => a.date.localeCompare(b.date));
  const updated = { ...doc, payments, updated_at: new Date().toISOString() };

  // Mark it paid when the balance clears, so the list does not need a human to
  // remember. Anything short of the full amount stays as it is; the balance is
  // shown everywhere it matters.
  const totals = computeTotals(updated);
  if (totals.balance_cents === 0 && canTransition(updated, "paid")) {
    updated.status = "paid";
    updated.paid_at = record.date;
  }

  await writeDocument(updated);
  return updated;
}

export async function removePayment(id, paymentId) {
  const doc = await readDocument(id);
  const payments = (doc.payments ?? []).filter((p) => p.id !== paymentId);
  if (payments.length === (doc.payments ?? []).length) throw new StoreError(`No payment ${paymentId}`, 404);
  if ((doc.links?.receipt_ids ?? []).length > 0) {
    throw new StoreError(
      "A receipt has already been issued against this invoice, so its payments cannot be removed. " +
        "Raise a credit note if the amount was wrong.",
      409
    );
  }
  const status = doc.status === "paid" ? "issued" : doc.status;
  const updated = { ...doc, payments, status, paid_at: null, updated_at: new Date().toISOString() };
  await writeDocument(updated);
  return updated;
}

// ------------------------------------------------------- derived documents

/** A receipt drafted from what has actually been paid against an invoice. */
export async function receiptFromInvoice(invoiceId) {
  const config = await readConfig();
  const invoice = await readDocument(invoiceId);
  if (invoice.type !== "invoice") throw new StoreError("Receipts are raised against invoices.", 400);
  if (!invoice.number) throw new StoreError("Issue the invoice first.", 409);
  const payments = invoice.payments ?? [];
  if (payments.length === 0) throw new StoreError("No payments recorded against this invoice yet.", 422);

  const totals = computeTotals(invoice);

  // A receipt is dated the day the money arrived, not the day someone got
  // round to raising it. Dating it "today" would put an October payment on a
  // September receipt, and file it in the wrong month's sequence with it.
  const lastPaymentDate = payments
    .map((payment) => payment.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  const receipt = blankDocument("receipt", config, {
    issued_at: lastPaymentDate ?? today(),
    client_id: invoice.client_id,
    client_snapshot: invoice.client_snapshot,
    currency: invoice.currency,
    reference: invoice.reference,
    specimen: Boolean(invoice.specimen),
    // The receipt restates what the invoice covered, one line per section, so
    // the client can see what they have paid for without holding both
    // documents side by side.
    sections: [
      {
        id: newSectionId(),
        title: "What this covers",
        meta: "",
        kind: "coverage",
        items: (invoice.sections ?? []).map((section, index) => ({
          id: newItemId(),
          description: `${index + 1} · ${section.title}`,
          note: "",
          qty: 1,
          unit_price_cents: totals.sectionSubtotal(section.id),
        })),
      },
    ],
    payments: payments.map((p) => ({ ...p })),
    // Discounts carry over so the receipt's "invoice total" is the figure the
    // client was actually asked for. Deposit adjustments do not: on a receipt
    // the deposit is one of the payments listed, and taking it off twice would
    // show an outstanding balance that is not owed.
    adjustments: (invoice.adjustments ?? []).filter((a) => !a.payment_id).map((a) => ({ ...a })),
    links: { invoice_id: invoice.id, quotation_id: invoice.links?.quotation_id ?? null, receipt_ids: [], credit_note_ids: [], corrects_id: null },
    source_number: invoice.number,
    source_issued_at: invoice.issued_at,
    gst: { ...invoice.gst },
  });

  await writeDocument(receipt);
  return receipt;
}

/** An invoice drafted from an accepted quotation, carrying its sections. */
export async function invoiceFromQuotation(quotationId) {
  const config = await readConfig();
  const quotation = await readDocument(quotationId);
  if (quotation.type !== "quotation") throw new StoreError("Only a quotation converts to an invoice.", 400);
  if (!quotation.number) throw new StoreError("Issue the quotation first.", 409);
  if (quotation.links?.invoice_id) {
    throw new StoreError(`This quotation has already been converted. See ${quotation.links.invoice_id}.`, 409);
  }

  const termsDays = config.terms?.payment_days ?? 30;
  const issued_at = today();
  const invoice = blankDocument("invoice", config, {
    client_id: quotation.client_id,
    client_snapshot: quotation.client_snapshot,
    currency: quotation.currency,
    reference: quotation.reference,
    specimen: Boolean(quotation.specimen),
    issued_at,
    terms_days: termsDays,
    due_date: addDaysISO(issued_at, termsDays),
    sections: (quotation.sections ?? []).map((section) => ({
      id: newSectionId(),
      title: section.title,
      meta: "",
      items: (section.items ?? []).map((item) => ({
        id: newItemId(),
        description: item.description,
        note: item.note ?? "",
        qty: item.qty,
        unit_price_cents: item.unit_price_cents,
      })),
    })),
    // The quotation's grant note and acceptance block do not belong on an
    // invoice — by then the project has commenced.
    panels: ["how_to_pay", "notes"],
    links: { quotation_id: quotation.id, invoice_id: null, receipt_ids: [], credit_note_ids: [], corrects_id: null },
    source_number: quotation.number,
    gst: { ...quotation.gst },
  });

  await writeDocument(invoice);
  await writeDocument({
    ...quotation,
    links: { ...(quotation.links ?? {}), invoice_id: invoice.id },
    updated_at: new Date().toISOString(),
  });
  return invoice;
}

/** A credit note against an issued document — the only way to correct one. */
export async function creditNoteFrom(documentId, { reason } = {}) {
  const config = await readConfig();
  const source = await readDocument(documentId);
  if (!source.number) throw new StoreError("Only an issued document can be credited.", 409);
  if (source.type !== "invoice") throw new StoreError("Credit notes are raised against invoices.", 400);

  const note = blankDocument("credit_note", config, {
    client_id: source.client_id,
    client_snapshot: source.client_snapshot,
    currency: source.currency,
    reference: source.reference,
    specimen: Boolean(source.specimen),
    sections: (source.sections ?? []).map((section) => ({
      id: newSectionId(),
      title: section.title,
      meta: section.meta ?? "",
      items: (section.items ?? []).map((item) => ({
        id: newItemId(),
        description: item.description,
        note: item.note ?? "",
        qty: item.qty,
        unit_price_cents: item.unit_price_cents,
      })),
    })),
    notes: reason ?? "",
    links: { corrects_id: source.id, invoice_id: source.id, quotation_id: null, receipt_ids: [], credit_note_ids: [] },
    source_number: source.number,
    gst: { ...source.gst },
  });

  await writeDocument(note);
  return note;
}

// ------------------------------------------------------------------ lookups

export async function findByNumber(number) {
  if (!parseNumber(number)) throw new StoreError(`"${number}" is not a Jura document number.`, 400);
  const summaries = await listDocuments();
  const match = summaries.find((s) => s.number === number);
  if (!match) throw new StoreError(`No document numbered ${number}.`, 404);
  return readDocument(match.id);
}

export async function ensureDataTree() {
  await mkdir(paths.documents, { recursive: true });
  await mkdir(paths.templates, { recursive: true });
  await mkdir(paths.outputs, { recursive: true });
  if (!(await exists(paths.counters))) await writeJsonAtomic(paths.counters, emptyCounters());
  if (!(await exists(paths.clients))) await writeJsonAtomic(paths.clients, []);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export { newDocumentId };
