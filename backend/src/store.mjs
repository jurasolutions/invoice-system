/**
 * The store: everything that reads or writes the records.
 *
 * This is the only place that touches the database, and it is where the two
 * rules that make the records worth keeping are actually enforced:
 *
 *   - a number is assigned once, atomically, and never reused
 *   - an issued document's content is frozen
 *
 * The builder enforces both in the UI as well, but the UI is a convenience.
 * The database enforces both a second time (see migrations/0001), so a mistake
 * here is refused rather than written.
 *
 * Anything that reads and then writes runs in a transaction and locks the row
 * it read (`for update`), so two requests cannot both read the same version and
 * each write their own. Inside a transaction every read and write goes through
 * the `q` it hands out — never the module-level `query`.
 */
import { query, transaction, migrate } from "./db.mjs";
import { emptyCounters, formatNumber, periodKey, parseNumber } from "@jura/shared/numbering.js";
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
} from "@jura/shared/document.js";
import { today } from "@jura/shared/dates.js";
import { isSafeId, slugify, newDocumentId, newClientId, newPaymentId, newSectionId, newItemId } from "@jura/shared/ids.js";
import { defaultConfig } from "@jura/shared/defaults/config.js";
import { seedTemplates } from "@jura/shared/defaults/templates.js";

export class StoreError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "StoreError";
    this.status = status;
    this.details = details;
  }
}

const json = (value) => JSON.stringify(value);

// ------------------------------------------------------------------- config

export async function readConfig(q = query) {
  const [row] = await q("select config from settings where id = 1");
  if (!row) {
    throw new StoreError("No company settings in the database. Restart the API — it writes the default on boot.", 503);
  }
  return row.config;
}

export async function writeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new StoreError("Settings must be an object.", 400);
  }
  await query(
    `insert into settings (id, config) values (1, $1::jsonb)
     on conflict (id) do update set config = excluded.config, updated_at = now()`,
    [json(config)]
  );
  return config;
}

// ------------------------------------------------------------------ clients

export async function readClients() {
  const rows = await query("select data from clients order by created_at, id");
  return rows.map((row) => row.data);
}

async function readClient(id, q = query) {
  const [row] = await q("select data from clients where id = $1", [id]);
  return row?.data ?? null;
}

export async function upsertClient(client) {
  const id = client?.id ?? newClientId();
  if (!isSafeId(id)) throw new StoreError(`Bad client id: ${id}`, 400);
  return transaction(async (q) => {
    const [existing] = await q("select data from clients where id = $1 for update", [id]);
    const record = { ...client, id, updated_at: new Date().toISOString() };
    const data = existing ? { ...existing.data, ...record } : { ...record, created_at: record.updated_at };
    await writeClientRow(data, q);
    return record;
  });
}

/** Exported for the seed and the JSON migration, which write clients as they are. */
export async function writeClientRow(client, q = query) {
  await q(
    `insert into clients (id, data, created_at) values ($1, $2::jsonb, coalesce($3::timestamptz, now()))
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [client.id, json(client), client.created_at ?? null]
  );
}

export async function deleteClient(id) {
  const rows = await query("delete from clients where id = $1 returning id", [id]);
  if (rows.length === 0) throw new StoreError(`No client ${id}`, 404);
}

// ---------------------------------------------------------------- templates

export async function listTemplates() {
  const rows = await query("select slug, data from templates");
  return rows
    .map((row) => ({ ...row.data, slug: row.slug }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}

export async function saveTemplate(template) {
  const slug = slugify(template.slug || template.name);
  if (!isSafeId(slug)) throw new StoreError(`Bad template name: ${template.name}`, 400);
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
  await writeTemplateRow(slug, record);
  return { ...record, slug };
}

/** Exported for the seed and the JSON migration, which write templates as they are. */
export async function writeTemplateRow(slug, record, q = query) {
  await q(
    `insert into templates (slug, name, sort_order, data) values ($1, $2, $3, $4::jsonb)
     on conflict (slug) do update
       set name = excluded.name, sort_order = excluded.sort_order, data = excluded.data, updated_at = now()`,
    [slug, record.name ?? slug, Number.isSafeInteger(record.order) ? record.order : 50, json(record)]
  );
}

export async function deleteTemplate(slug) {
  if (!isSafeId(slug)) throw new StoreError(`Bad template slug: ${slug}`, 400);
  await query("delete from templates where slug = $1", [slug]);
}

// ---------------------------------------------------------------- documents

function checkId(id) {
  if (!isSafeId(id)) throw new StoreError(`Bad document id: ${id}`, 400);
  return id;
}

export async function readDocument(id, q = query) {
  const [row] = await q("select data from documents where id = $1", [checkId(id)]);
  if (!row) throw new StoreError(`No document ${id}`, 404);
  return row.data;
}

/** Read a document and hold its row until the transaction ends. */
async function lockDocument(q, id) {
  const [row] = await q("select data from documents where id = $1 for update", [checkId(id)]);
  if (!row) throw new StoreError(`No document ${id}`, 404);
  return row.data;
}

export async function listDocuments() {
  const rows = await query("select data from documents");
  const summaries = rows.map((row) => summarise(row.data));
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
    const client = await readClient(client_id);
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
 * write back through to the template.
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

/**
 * Write a whole document. Exported for the seed and the JSON migration.
 *
 * The number, type and status columns are copies of the document's own fields,
 * so the database can hold the numbering rules without parsing JSON.
 */
export async function writeDocument(doc, q = query) {
  checkId(doc.id);
  await q(
    `insert into documents (id, type, number, status, issued_at, data) values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (id) do update
       set type = excluded.type, number = excluded.number, status = excluded.status,
           issued_at = excluded.issued_at, data = excluded.data, updated_at = now()`,
    [doc.id, doc.type, doc.number ?? null, doc.status, doc.issued_at ?? null, json(doc)]
  );
  return doc;
}

/**
 * Save a document.
 *
 * A draft saves wholesale. An issued document only accepts changes to the
 * fields that record what happened to it after it went out — anything else is
 * refused, by name, so the caller knows exactly what it tried to change.
 */
export async function saveDocument(id, incoming) {
  return transaction(async (q) => {
    const existing = await lockDocument(q, id);

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
      await writeDocument(merged, q);
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
    await writeDocument(merged, q);
    return merged;
  });
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));
}

export async function deleteDocument(id) {
  await transaction(async (q) => {
    const doc = await lockDocument(q, id);
    if (doc.number) {
      throw new StoreError(
        `${doc.number} has been issued and cannot be deleted. Void it instead — the number stays in the sequence.`,
        409
      );
    }
    await q("delete from documents where id = $1", [id]);
  });
}

// ----------------------------------------------------------------- numbering

/** Every counter, in the shape `{ invoice: { "2026-09": 3 }, quotation: {}, ... }`. */
export async function readCounters(q = query) {
  const counters = emptyCounters();
  for (const row of await q("select doc_type, period, seq from counters order by doc_type, period")) {
    counters[row.doc_type][row.period] = row.seq;
  }
  return counters;
}

/**
 * Issue a document: assign its number and lock its content.
 *
 * One transaction: lock the document, take the next number with a single
 * upsert on the counter row, write the document. Two concurrent issues queue on
 * the counter row, so they cannot get the same number; and because the counter
 * moves in the same transaction as the document, a failure anywhere rolls both
 * back — no duplicate, and no gap either.
 */
export async function issueDocument(id, { issued_at } = {}) {
  try {
    return await transaction(async (q) => {
      const config = await readConfig(q);
      const doc = await lockDocument(q, id);
      if (doc.number) throw new StoreError(`Already issued as ${doc.number}.`, 409);

      if (issued_at) doc.issued_at = issued_at;

      const problems = validateForIssue(doc, config);
      if (problems.length > 0) {
        throw new StoreError(`This document is not ready to issue: ${problems.join(" ")}`, 422, { problems });
      }

      const period = periodKey(doc.issued_at);
      const [{ seq }] = await q(
        `insert into counters (doc_type, period, seq) values ($1, $2, 1)
         on conflict (doc_type, period) do update set seq = counters.seq + 1
         returning seq`,
        [doc.type, period]
      );

      const issued = {
        ...doc,
        number: formatNumber(doc.type, period, seq),
        status: "issued",
        issued_at: doc.issued_at,
        company_snapshot: snapshotCompany(config),
        updated_at: new Date().toISOString(),
      };
      await writeDocument(issued, q);

      // A receipt or credit note points back at the document it settles or
      // corrects; write the return link now that both have numbers.
      await backlink(issued, q);

      return issued;
    });
  } catch (error) {
    // The counter is behind the documents — edited by hand, or restored
    // without them. The unique constraint refused the duplicate and the
    // transaction took the counter back with it.
    if (error.code === "23505" && /number/.test(error.constraint ?? error.message ?? "")) {
      throw new StoreError(
        "The next number is already taken by another document, so nothing was issued. " +
          "The counter is behind the documents; set it to the highest number in use for that month.",
        409
      );
    }
    throw error;
  }
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

async function backlink(doc, q) {
  const targetId = doc.links?.invoice_id ?? doc.links?.corrects_id ?? null;
  if (!targetId || targetId === doc.id || !isSafeId(targetId)) return;
  const [row] = await q("select data from documents where id = $1 for update", [targetId]);
  if (!row) return;
  const target = row.data;
  const links = { ...(target.links ?? {}) };
  if (doc.type === "receipt") {
    links.receipt_ids = [...new Set([...(links.receipt_ids ?? []), doc.id])];
  } else if (doc.type === "credit_note") {
    links.credit_note_ids = [...new Set([...(links.credit_note_ids ?? []), doc.id])];
  } else if (doc.type === "invoice") {
    links.invoice_id = doc.id;
  }
  await writeDocument({ ...target, links, updated_at: new Date().toISOString() }, q);
}

// ------------------------------------------------------------------ lifecycle

export async function setStatus(id, next, { reason } = {}) {
  return transaction(async (q) => {
    const doc = await lockDocument(q, id);
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
    await writeDocument(updated, q);
    return updated;
  });
}

/**
 * Record a payment against an issued invoice.
 *
 * Payments are one of the few things allowed to change after issue: the
 * invoice's content is fixed, but what the client has since paid against it is
 * not part of that content.
 */
export async function recordPayment(id, payment) {
  return transaction(async (q) => {
    const doc = await lockDocument(q, id);
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

    await writeDocument(updated, q);
    return updated;
  });
}

export async function removePayment(id, paymentId) {
  return transaction(async (q) => {
    const doc = await lockDocument(q, id);
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
    await writeDocument(updated, q);
    return updated;
  });
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
  return transaction(async (q) => {
    const config = await readConfig(q);
    // Locked, so two clicks on "convert" cannot both see no invoice yet.
    const quotation = await lockDocument(q, quotationId);
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

    await writeDocument(invoice, q);
    await writeDocument(
      { ...quotation, links: { ...(quotation.links ?? {}), invoice_id: invoice.id }, updated_at: new Date().toISOString() },
      q
    );
    return invoice;
  });
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
  const [row] = await query("select data from documents where number = $1", [number]);
  if (!row) throw new StoreError(`No document numbered ${number}.`, 404);
  return row.data;
}

// -------------------------------------------------------------------- boot

/**
 * Make sure the database is ready. Called on every boot.
 *
 * Runs any pending migrations, then fills in what an empty database needs to
 * be usable. Nothing here overwrites anything, and the counters are never
 * touched — an empty counter table over existing documents would try to hand
 * out numbers already in use (and the unique constraint would refuse them).
 *
 * The settings are written when absent because a hosted first boot has no
 * shell to seed from, and without them every request answers 503. The shipped
 * default has placeholder company details that block issuing, so settings
 * created this way cannot produce a document.
 */
export async function ensureDatabase({ log = console.log } = {}) {
  await migrate({ log });

  const [created] = await query(
    "insert into settings (id, config) values (1, $1::jsonb) on conflict (id) do nothing returning id",
    [json(defaultConfig())]
  );
  if (created) {
    log?.("[jura] no settings in the database - wrote the default.");
    log?.("[jura] Company and payment details are placeholders; issuing is blocked until they are set.");
  }

  const [{ count }] = await query("select count(*)::int as count from templates");
  if (count === 0) {
    for (const { slug, ...rest } of seedTemplates) {
      await writeTemplateRow(slug, { ...rest, updated_at: new Date().toISOString() });
    }
    log?.(`[jura] no templates - wrote the ${seedTemplates.length} that ship with the app.`);
  }
}

export { newDocumentId };
