/**
 * The document record: what it contains, what it adds up to, and what may
 * still be changed once it has gone out.
 *
 * Everything here is pure. The same functions run in the browser to drive the
 * preview and in Node to guard the store, so the app and the file on disk can
 * never disagree about what a document is worth.
 */

import { lineAmountCents, roundHalfAwayFromZero, sumCents } from "./money.js";
import { addDays, isISODate, today } from "./dates.js";
import { DOCUMENT_TYPES, TYPE_LABEL } from "./numbering.js";
import { newAdjustmentId, newDocumentId, newItemId, newPaymentId, newSectionId } from "./ids.js";

export const SCHEMA_VERSION = 1;

export { DOCUMENT_TYPES, TYPE_LABEL };

/**
 * Status transitions, per type. A status not listed here cannot be reached,
 * which keeps a receipt from being marked "expired" and a draft from being
 * marked "paid" without passing through issue.
 */
export const STATUS_FLOW = {
  quotation: {
    draft: ["issued", "void"],
    issued: ["sent", "accepted", "expired", "void"],
    sent: ["accepted", "expired", "void"],
    accepted: ["void"],
    expired: ["void"],
    void: [],
  },
  invoice: {
    draft: ["issued", "void"],
    issued: ["sent", "paid", "void"],
    sent: ["paid", "void"],
    paid: ["void"],
    void: [],
  },
  receipt: {
    draft: ["issued", "void"],
    issued: ["sent", "void"],
    sent: ["void"],
    void: [],
  },
  credit_note: {
    draft: ["issued", "void"],
    issued: ["sent", "void"],
    sent: ["void"],
    void: [],
  },
};

/** A document is issued once it has a number. Drafts have none. */
export function isIssued(doc) {
  return Boolean(doc?.number) && doc.status !== "draft";
}

/**
 * Fields that may still change after issue.
 *
 * An issued document is a record of what the client received, so its content
 * is frozen. What is still allowed is the story of what happened to it
 * afterwards — it was sent, it was paid, it was voided, a receipt was raised
 * against it. Corrections go on a credit note, never on the original.
 */
export const MUTABLE_AFTER_ISSUE = new Set([
  "status",
  "sent_at",
  "paid_at",
  "accepted_at",
  "voided_at",
  "void_reason",
  "payments",
  "links",
  "updated_at",
]);

/** Which fields a caller is trying to change that it is not allowed to. */
export function frozenFieldsTouched(existing, incoming) {
  const touched = [];
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  for (const key of keys) {
    if (MUTABLE_AFTER_ISSUE.has(key)) continue;
    if (!deepEqual(existing[key], incoming[key])) touched.push(key);
  }
  return touched;
}

// ---------------------------------------------------------------- construction

export function blankItem(overrides = {}) {
  return {
    id: newItemId(),
    description: "",
    note: "",
    qty: 1,
    unit_price_cents: null,
    ...overrides,
  };
}

export function blankSection(overrides = {}) {
  return {
    id: newSectionId(),
    title: "",
    meta: "",
    items: [blankItem()],
    ...overrides,
  };
}

/**
 * A new draft. Unnumbered by definition — the number is assigned at issue and
 * a draft that never issues leaves no gap in the sequence.
 */
export function blankDocument(type, config, overrides = {}) {
  if (!DOCUMENT_TYPES.includes(type)) throw new Error(`Unknown document type: ${type}`);
  const issued_at = overrides.issued_at ?? today();
  const termsDays = config?.terms?.payment_days ?? 30;
  const validityDays = config?.terms?.quotation_validity_days ?? 30;
  const now = new Date().toISOString();

  return {
    id: newDocumentId(),
    type,
    number: null,
    status: "draft",
    issued_at,
    client_id: null,
    client_snapshot: null,
    reference: "",
    prepared_by: config?.company?.prepared_by ?? "",
    currency: config?.currency ?? "SGD",
    terms_days: type === "invoice" ? termsDays : null,
    due_date: type === "invoice" ? addDays(issued_at, termsDays) : null,
    valid_until: type === "quotation" ? addDays(issued_at, validityDays) : null,
    sections: [blankSection()],
    adjustments: [],
    payments: [],
    // Snapshotted from config at creation, so registering for GST later does
    // not retroactively change a document that went out before registration.
    gst: {
      registered: Boolean(config?.gst?.registered),
      rate_bp: config?.gst?.rate_bp ?? 900,
      number: config?.gst?.number ?? null,
    },
    panels: defaultPanels(type),
    notes: "",
    specimen: false,
    links: { quotation_id: null, invoice_id: null, receipt_ids: [], credit_note_ids: [], corrects_id: null },
    created_at: now,
    updated_at: now,
    schema_version: SCHEMA_VERSION,
    ...overrides,
  };
}

function defaultPanels(type) {
  switch (type) {
    // The grant note goes on quotations and nowhere else. By invoice stage the
    // project has commenced, which is exactly the point at which a grant
    // application stops being possible — see the PRD, §1.
    case "quotation": return ["grant_note", "acceptance", "inclusions"];
    case "invoice": return ["how_to_pay", "notes"];
    case "receipt": return ["for_your_records"];
    case "credit_note": return ["notes"];
    default: return [];
  }
}

export function blankAdjustment(overrides = {}) {
  return { id: newAdjustmentId(), label: "", amount_cents: 0, payment_id: null, ...overrides };
}

export function blankPayment(overrides = {}) {
  return {
    id: newPaymentId(),
    date: today(),
    method: "Bank transfer",
    reference: "",
    applied_to: "Balance",
    amount_cents: 0,
    note: "",
    ...overrides,
  };
}

// -------------------------------------------------------------------- totalling

/**
 * Everything a document adds up to, in cents.
 *
 * The one subtlety is a deposit taken before the invoice went out. It appears
 * on the invoice face as an adjustment ("less deposit paid 18 Aug") *and* as a
 * payment record, because the receipt has to account for it. Counting it twice
 * would understate the balance, so the adjustment carries `payment_id` naming
 * the payment it represents, and the two figures below keep them apart:
 *
 *   net_total  — what the client owes in total, ignoring anything paid
 *   amount_due — what the invoice face asks for, after deposits already taken
 *
 * A discount is an adjustment with no `payment_id`, so it reduces both.
 */
export function computeTotals(doc) {
  const sections = (doc?.sections ?? []).map((section) => {
    const items = (section.items ?? []).map((item) => ({
      ...item,
      amount_cents: lineAmountCents(item.qty ?? 0, item.unit_price_cents),
    }));
    return { id: section.id, items, subtotal_cents: sumCents(items.map((i) => i.amount_cents)) };
  });

  const subtotal_cents = sumCents(sections.map((s) => s.subtotal_cents));

  const gstRegistered = Boolean(doc?.gst?.registered);
  const rate_bp = doc?.gst?.rate_bp ?? 0;
  const gst_cents = gstRegistered ? roundHalfAwayFromZero((subtotal_cents * rate_bp) / 10000) : 0;

  const total_cents = subtotal_cents + gst_cents;

  const adjustments = doc?.adjustments ?? [];
  const adjustments_cents = sumCents(adjustments.map((a) => a.amount_cents ?? 0));
  const deposit_adjustments_cents = sumCents(
    adjustments.filter((a) => a.payment_id).map((a) => a.amount_cents ?? 0)
  );
  const discounts_cents = adjustments_cents - deposit_adjustments_cents;

  // What the invoice face asks for.
  const amount_due_cents = total_cents + adjustments_cents;
  // What is owed altogether, before anything paid is taken off.
  const net_total_cents = total_cents + discounts_cents;

  const payments = doc?.payments ?? [];
  const payments_cents = sumCents(payments.map((p) => p.amount_cents ?? 0));
  const balance_cents = net_total_cents - payments_cents;

  return {
    sections,
    sectionSubtotal: (id) => sections.find((s) => s.id === id)?.subtotal_cents ?? 0,
    subtotal_cents,
    gst_cents,
    gst_registered: gstRegistered,
    total_cents,
    adjustments_cents,
    discounts_cents,
    deposit_adjustments_cents,
    amount_due_cents,
    net_total_cents,
    payments_cents,
    balance_cents,
    fully_paid: balance_cents === 0 && payments_cents > 0,
  };
}

/** The line amount for one item, for the builder's live row total. */
export function itemAmount(item) {
  return lineAmountCents(item?.qty ?? 0, item?.unit_price_cents);
}

// ------------------------------------------------------------------ validation

/**
 * What has to be true before a document can be issued.
 *
 * This runs on both sides. The builder shows the list so nothing is a surprise
 * at the last moment, and the store checks it again before assigning a number,
 * because a number handed to an incomplete document cannot be taken back.
 */
export function validateForIssue(doc, config) {
  const problems = [];

  if (!DOCUMENT_TYPES.includes(doc?.type)) problems.push("Document type is not recognised.");
  if (doc?.number) problems.push(`Already issued as ${doc.number}.`);
  if (doc?.status !== "draft") problems.push(`Only a draft can be issued — this one is ${doc?.status}.`);

  if (!doc?.client_snapshot?.name?.trim()) problems.push("Pick a client. The document needs a name to be billed to.");
  if (!isISODate(doc?.issued_at)) problems.push("Issue date is missing or malformed.");

  const totals = computeTotals(doc);
  const hasItems = totals.sections.some((s) => s.items.length > 0);
  if (!hasItems) problems.push("Add at least one item.");

  for (const section of doc?.sections ?? []) {
    if (!section.title?.trim()) problems.push("Every section needs a title.");
    for (const item of section.items ?? []) {
      if (!item.description?.trim()) problems.push("Every item needs a description.");
      if (item.unit_price_cents == null) {
        problems.push(
          item.description?.trim()
            ? `"${item.description.trim()}" has no unit price.`
            : "An item has no unit price."
        );
      }
    }
  }

  if (doc?.type === "invoice" && !isISODate(doc?.due_date)) problems.push("Invoices need a due date.");
  if (doc?.type === "quotation" && !isISODate(doc?.valid_until)) problems.push("Quotations need a validity date.");
  if (doc?.type === "receipt" && (doc?.payments ?? []).length === 0) {
    problems.push("A receipt needs at least one recorded payment.");
  }

  if (!config?.company?.legal_name?.trim()) problems.push("Company legal name is not set in config.json.");
  if (config?.company?.uen_confirmed === false) {
    problems.push("The UEN in config.json is still a placeholder. A document showing a placeholder UEN should not go to a client.");
  }
  if (doc?.gst?.registered && !doc?.gst?.number) {
    problems.push("GST is switched on but no GST registration number is set.");
  }

  if (doc?.type === "quotation" && doc?.panels?.includes("grant_note")) {
    const stale = grantNoteAge(config);
    if (stale?.missing) problems.push("The grant note has no checked-on date in config.json.");
  }

  return [...new Set(problems)];
}

/**
 * How old the grant note's "checked on" date is.
 *
 * Enterprise Singapore is consolidating EDG, PSG and MRA into a single EDGE
 * scheme through the second half of 2026. A note that quietly goes stale is
 * worse than no note, so the app nags past 180 days rather than waiting for a
 * client to point it out.
 */
export function grantNoteAge(config, now = today()) {
  const note = config?.panels?.grant_note;
  const checked = note?.checked_on;
  if (!isISODate(checked)) return { missing: true, days: null, stale: true, checked_on: null };
  const days = daysSince(checked, now);
  return { missing: false, days, stale: days > (note?.stale_after_days ?? 180), checked_on: checked };
}

function daysSince(iso, now) {
  const MS_PER_DAY = 86400000;
  const [ay, am, ad] = iso.split("-").map(Number);
  const [by, bm, bd] = now.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** Can this document move from where it is to `next`? */
export function canTransition(doc, next) {
  const flow = STATUS_FLOW[doc?.type];
  if (!flow) return false;
  return (flow[doc.status] ?? []).includes(next);
}

// -------------------------------------------------------------------- helpers

/**
 * The client's details as they were on the day the document was issued.
 *
 * Copied rather than referenced on purpose. A client that moves office in
 * November must not silently rewrite the address on the invoice they were sent
 * in September — that document is a record of what they received.
 */
export function snapshotClient(client) {
  if (!client) return null;
  return {
    client_id: client.id ?? null,
    name: client.name ?? "",
    attention: client.attention ?? "",
    address_lines: [...(client.address_lines ?? [])],
    email: client.email ?? "",
    uen: client.uen ?? "",
  };
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

export { deepEqual };
