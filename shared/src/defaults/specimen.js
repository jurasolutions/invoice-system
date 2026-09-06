/**
 * The specimen documents — the ones drawn in the concept design.
 *
 * Optional, and off by default (`npm run seed -- --with-specimen`). They exist
 * so there is something real to look at, to print, and to run the pagination
 * against before a single client has been billed.
 *
 * Every one of them is flagged `specimen: true`, which prints the amber
 * "Specimen · sample data, illustrative figures" chip in the footer. The
 * client, the amounts and the dates are invented and are labelled as invented.
 * Nothing here is a claim about work Jura has done.
 *
 * They take the first number in their month, so the sequence they leave behind
 * is gapless. Seed them into a data tree you are about to bill from, and the
 * first real invoice will be number 002. Seed without them for a clean start.
 */

const CLIENT_ID = "cli_specimen_northbridge";

export const specimenClient = {
  id: CLIENT_ID,
  name: "Northbridge Dental Group Pte. Ltd.",
  attention: "Rachel Ong, operations manager",
  address_lines: ["18 Kallang Avenue, #07-12", "Singapore 339410"],
  email: "accounts@northbridgedental.example",
  uen: "",
  specimen: true,
  notes: "Specimen client from the concept design. Delete once you have real ones.",
};

const clientSnapshot = {
  client_id: CLIENT_ID,
  name: specimenClient.name,
  attention: specimenClient.attention,
  address_lines: [...specimenClient.address_lines],
  email: specimenClient.email,
  uen: "",
};

const companySnapshot = {
  legal_name: "Jura Solutions Pte. Ltd.",
  uen: "UEN to confirm",
  uen_confirmed: false,
  address_lines: ["Registered address to confirm", "Singapore"],
  address_confirmed: false,
  email: "info@jurasolutions.sg",
  website: "jurasolutions.sg",
  tagline: "Automation consultancy",
};

const gst = { registered: false, rate_bp: 900, number: null };
const noLinks = { quotation_id: null, invoice_id: null, receipt_ids: [], credit_note_ids: [], corrects_id: null };

// Amounts in cents, matching the concept exactly.
const DISCOVERY = (meta) => ({
  id: "sec_specimen_discovery",
  title: "Discovery",
  meta,
  items: [
    {
      id: "itm_specimen_workshops",
      description: "Process mapping workshops",
      note: "Two sessions with the front desk and accounts teams, mapping invoice intake as it actually runs.",
      qty: 2,
      unit_price_cents: 120000,
    },
    { id: "itm_specimen_docs", description: "Current-state documentation", note: "", qty: 1, unit_price_cents: 120000 },
  ],
});

const BUILD = (meta) => ({
  id: "sec_specimen_build",
  title: "First automation — invoice intake",
  meta,
  items: [
    { id: "itm_specimen_build", description: "Build and configuration", note: "", qty: 1, unit_price_cents: 560000 },
    {
      id: "itm_specimen_connectors",
      description: "Connector setup",
      note: "Accounting system, shared mailbox intake, document storage.",
      qty: 3,
      unit_price_cents: 48000,
    },
    { id: "itm_specimen_testing", description: "Exception handling and test cycle", note: "", qty: 1, unit_price_cents: 110000 },
  ],
});

const HANDOVER_INVOICE = {
  id: "sec_specimen_handover",
  title: "Handover",
  meta: "Completed 03 Sep 2026",
  items: [
    { id: "itm_specimen_runbook", description: "Documentation pack and runbook", note: "", qty: 1, unit_price_cents: 60000 },
    { id: "itm_specimen_session", description: "Handover session and credential transfer", note: "", qty: 1, unit_price_cents: 40000 },
  ],
};

const DEPOSIT_PAYMENT = {
  id: "pay_specimen_deposit",
  date: "2026-08-18",
  method: "Bank transfer",
  reference: "FT2608184471",
  applied_to: "Deposit",
  amount_cents: 300000,
  note: "",
};

const BALANCE_PAYMENT = {
  id: "pay_specimen_balance",
  date: "2026-10-04",
  method: "PayNow",
  reference: "JURA-2026-09-001",
  applied_to: "Balance",
  amount_cents: 974000,
  note: "Final settlement of the balance due.",
};

/**
 * The three documents, and the counter state they leave behind.
 *
 * The quotation was issued in August and converted; the invoice in September;
 * the receipt in October once the balance cleared. Each takes 001 in its own
 * month, so the counters below are simply the highest number used.
 */
export function specimenDocuments() {
  const now = "2026-09-06T10:00:00.000Z";

  const quotation = {
    id: "doc_specimen_quotation",
    type: "quotation",
    number: "JURA-Q-2026-08-001",
    status: "accepted",
    issued_at: "2026-08-11",
    accepted_at: "2026-08-18",
    client_id: CLIENT_ID,
    client_snapshot: clientSnapshot,
    company_snapshot: companySnapshot,
    reference: "PO-4417",
    prepared_by: "Ting Yu",
    currency: "SGD",
    terms_days: null,
    due_date: null,
    valid_until: "2026-09-10",
    sections: [
      DISCOVERY("2 weeks"),
      BUILD("4 to 6 weeks"),
      {
        id: "sec_specimen_handover",
        title: "Handover",
        meta: "1 week",
        items: [
          {
            id: "itm_specimen_handover_all",
            description: "Documentation pack, runbook, credential transfer",
            note: "",
            qty: 1,
            unit_price_cents: 100000,
          },
        ],
      },
    ],
    adjustments: [],
    payments: [],
    gst,
    panels: ["grant_note", "acceptance", "inclusions"],
    notes: "",
    specimen: true,
    links: { ...noLinks, invoice_id: "doc_specimen_invoice" },
    created_at: now,
    updated_at: now,
    schema_version: 1,
  };

  const invoice = {
    id: "doc_specimen_invoice",
    type: "invoice",
    number: "JURA-2026-09-001",
    status: "paid",
    issued_at: "2026-09-06",
    paid_at: "2026-10-04",
    client_id: CLIENT_ID,
    client_snapshot: clientSnapshot,
    company_snapshot: companySnapshot,
    reference: "PO-4417",
    prepared_by: "Ting Yu",
    currency: "SGD",
    terms_days: 30,
    due_date: "2026-10-06",
    valid_until: null,
    sections: [DISCOVERY("Completed 22 Aug 2026"), BUILD("Live 29 Aug 2026"), HANDOVER_INVOICE],
    // The deposit is on the invoice face as an adjustment and in the payments
    // list as a payment, linked by `payment_id` so it is only counted once.
    // See computeTotals() in src/domain/document.js.
    adjustments: [
      {
        id: "adj_specimen_deposit",
        label: "Less deposit paid 18 Aug 2026",
        amount_cents: -300000,
        payment_id: "pay_specimen_deposit",
      },
    ],
    payments: [DEPOSIT_PAYMENT, BALANCE_PAYMENT],
    gst,
    panels: ["how_to_pay", "notes"],
    notes:
      "The automation is running in your environment under your accounts. Documentation, credentials and the off-switch were handed over on 3 September 2026. Ongoing support is quoted separately.",
    specimen: true,
    links: { ...noLinks, quotation_id: "doc_specimen_quotation", receipt_ids: ["doc_specimen_receipt"] },
    source_number: "JURA-Q-2026-08-001",
    created_at: now,
    updated_at: now,
    schema_version: 1,
  };

  const receipt = {
    id: "doc_specimen_receipt",
    type: "receipt",
    number: "JURA-R-2026-10-001",
    status: "issued",
    issued_at: "2026-10-04",
    client_id: CLIENT_ID,
    client_snapshot: clientSnapshot,
    company_snapshot: companySnapshot,
    reference: "PO-4417",
    prepared_by: "Ting Yu",
    currency: "SGD",
    terms_days: null,
    due_date: null,
    valid_until: null,
    sections: [
      {
        id: "sec_specimen_coverage",
        title: "What this covers",
        meta: "",
        kind: "coverage",
        items: [
          { id: "itm_cov_1", description: "1 · Discovery", note: "", qty: 1, unit_price_cents: 360000 },
          { id: "itm_cov_2", description: "2 · First automation — invoice intake", note: "", qty: 1, unit_price_cents: 814000 },
          { id: "itm_cov_3", description: "3 · Handover", note: "", qty: 1, unit_price_cents: 100000 },
        ],
      },
    ],
    adjustments: [],
    payments: [DEPOSIT_PAYMENT, BALANCE_PAYMENT],
    gst,
    panels: ["for_your_records"],
    notes: "",
    specimen: true,
    links: { ...noLinks, invoice_id: "doc_specimen_invoice", quotation_id: "doc_specimen_quotation" },
    source_number: "JURA-2026-09-001",
    source_issued_at: "2026-09-06",
    created_at: now,
    updated_at: now,
    schema_version: 1,
  };

  return {
    documents: [quotation, invoice, receipt],
    counters: {
      quotation: { "2026-08": 1 },
      invoice: { "2026-09": 1 },
      receipt: { "2026-10": 1 },
      credit_note: {},
    },
  };
}
