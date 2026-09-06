/**
 * The store, against a real temporary data tree.
 *
 * These run against the filesystem on purpose. The rules being tested —
 * atomic counter writes, a lock that refuses rather than guesses, an issued
 * document that will not take an edit — are all rules about what happens on
 * disk, and a mocked filesystem would test the mock.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// paths.mjs reads the environment when it is first imported, so the temp
// directory has to be set before anything pulls it in.
const root = await mkdtemp(join(tmpdir(), "jura-store-"));
process.env.JURA_DATA_PATH = join(root, "data/invoices");
process.env.JURA_OUTPUT_PATH = join(root, "outputs/invoices");

const store = await import("../src/store.mjs");
const { paths } = await import("../src/paths.mjs");
const { writeJsonAtomic, withLock, LockBusyError } = await import("../src/atomic.mjs");
const { defaultConfig } = await import("@jura/shared/defaults/config.js");
const { emptyCounters } = await import("@jura/shared/numbering.js");
const { computeTotals } = await import("@jura/shared/document.js");

const readyConfig = () => {
  const config = defaultConfig();
  config.company.uen = "202612345K";
  config.company.uen_confirmed = true;
  config.company.address_lines = ["1 Somewhere Road, #01-01", "Singapore 100001"];
  config.company.address_confirmed = true;
  return config;
};

const CLIENT = {
  id: "cli_test",
  name: "Northbridge Dental Group Pte. Ltd.",
  attention: "Rachel Ong, operations manager",
  address_lines: ["18 Kallang Avenue, #07-12", "Singapore 339410"],
  email: "accounts@northbridgedental.example",
};

async function freshTree({ config = readyConfig(), counters = emptyCounters() } = {}) {
  await rm(paths.root, { recursive: true, force: true });
  await store.ensureDataTree();
  await writeJsonAtomic(paths.config, config);
  await writeJsonAtomic(paths.counters, counters);
  await writeJsonAtomic(paths.clients, [CLIENT]);
}

/** A draft that is complete enough to issue. */
async function readyDraft(overrides = {}) {
  const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id });
  return store.saveDocument(doc.id, {
    issued_at: "2026-09-06",
    due_date: "2026-10-06",
    terms_days: 30,
    reference: "PO-4417",
    sections: [
      {
        id: "sec_1",
        title: "Discovery",
        meta: "Completed 22 Aug 2026",
        items: [
          { id: "itm_1", description: "Process mapping workshops", note: "", qty: 2, unit_price_cents: 120000 },
          { id: "itm_2", description: "Current-state documentation", note: "", qty: 1, unit_price_cents: 120000 },
        ],
      },
    ],
    ...overrides,
  });
}

beforeEach(async () => {
  await freshTree();
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("issuing assigns a number", () => {
  it("gives a draft its number and locks it", async () => {
    const draft = await readyDraft();
    expect(draft.number).toBe(null);

    const issued = await store.issueDocument(draft.id);
    expect(issued.number).toBe("JURA-2026-09-001");
    expect(issued.status).toBe("issued");

    const counters = JSON.parse(await readFile(paths.counters, "utf8"));
    expect(counters.invoice["2026-09"]).toBe(1);
  });

  it("freezes the company details onto the document at issue", async () => {
    const draft = await readyDraft();
    const issued = await store.issueDocument(draft.id);
    expect(issued.company_snapshot.uen).toBe("202612345K");

    // Jura changes address later.
    const config = readyConfig();
    config.company.address_lines = ["9 New Road", "Singapore 200002"];
    await store.writeConfig(config);

    const reread = await store.readDocument(draft.id);
    expect(reread.company_snapshot.address_lines).toEqual(["1 Somewhere Road, #01-01", "Singapore 100001"]);
  });

  it("refuses a second number for the same document", async () => {
    const draft = await readyDraft();
    await store.issueDocument(draft.id);
    await expect(store.issueDocument(draft.id)).rejects.toThrow(/Already issued/);
  });

  it("hands out different numbers to documents issued in the same moment", async () => {
    const drafts = await Promise.all([readyDraft(), readyDraft(), readyDraft(), readyDraft(), readyDraft()]);
    const issued = await Promise.all(drafts.map((d) => store.issueDocument(d.id)));
    const numbers = issued.map((d) => d.number);

    expect(new Set(numbers).size).toBe(5);
    expect([...numbers].sort()).toEqual([
      "JURA-2026-09-001",
      "JURA-2026-09-002",
      "JURA-2026-09-003",
      "JURA-2026-09-004",
      "JURA-2026-09-005",
    ]);

    const counters = JSON.parse(await readFile(paths.counters, "utf8"));
    expect(counters.invoice["2026-09"]).toBe(5);
  });

  it("starts a new sequence in the next month and leaves the old one alone", async () => {
    await store.issueDocument((await readyDraft()).id);
    const october = await readyDraft({ issued_at: "2026-10-01", due_date: "2026-10-31" });
    const issued = await store.issueDocument(october.id);
    expect(issued.number).toBe("JURA-2026-10-001");

    const counters = JSON.parse(await readFile(paths.counters, "utf8"));
    expect(counters.invoice).toEqual({ "2026-09": 1, "2026-10": 1 });
  });

  it("refuses to issue a draft that is not ready, and burns no number doing it", async () => {
    const doc = await store.createDocument({ type: "invoice" });
    await expect(store.issueDocument(doc.id)).rejects.toThrow(/not ready to issue/);

    const counters = JSON.parse(await readFile(paths.counters, "utf8"));
    expect(counters.invoice).toEqual({});
  });
});

describe("a corrupted counters file", () => {
  it("refuses to issue rather than restarting the sequence", async () => {
    await writeFile(paths.counters, "{ this is not json", "utf8");
    const draft = await readyDraft();
    await expect(store.issueDocument(draft.id)).rejects.toThrow(/not valid JSON/);
  });

  it("refuses when a counter is not a whole number", async () => {
    await writeJsonAtomic(paths.counters, { ...emptyCounters(), invoice: { "2026-09": "seven" } });
    const draft = await readyDraft();
    await expect(store.issueDocument(draft.id)).rejects.toThrow(/not a whole number/);
  });

  it("refuses when the file is missing entirely", async () => {
    await rm(paths.counters, { force: true });
    const draft = await readyDraft();
    await expect(store.issueDocument(draft.id)).rejects.toThrow(/No counters\.json/);
  });

  it("leaves the number unassigned after a refusal", async () => {
    await writeJsonAtomic(paths.counters, { ...emptyCounters(), invoice: { "2026-09": -3 } });
    const draft = await readyDraft();
    await expect(store.issueDocument(draft.id)).rejects.toThrow();
    expect((await store.readDocument(draft.id)).number).toBe(null);
  });
});

describe("the counter lock", () => {
  // It waits out the full lock timeout before refusing, which is the point —
  // the common case is two clicks half a second apart, not a crashed process.
  it("refuses rather than breaking a lock it did not take", async () => {
    await mkdir(paths.countersLock, { recursive: true });
    const draft = await readyDraft();
    await expect(store.issueDocument(draft.id)).rejects.toThrow(LockBusyError);
    await rm(paths.countersLock, { recursive: true, force: true });
  }, 15000);

  it("serialises work and always releases, even when the work throws", async () => {
    const lock = join(paths.root, "test.lock");
    await expect(withLock(lock, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // The lock is free again, so this succeeds rather than timing out.
    await expect(withLock(lock, async () => "ok")).resolves.toBe("ok");
  });
});

describe("an issued document cannot be edited", () => {
  it("refuses a content change and names the fields", async () => {
    const draft = await readyDraft();
    const issued = await store.issueDocument(draft.id);

    await expect(
      store.saveDocument(issued.id, { sections: [{ id: "sec_1", title: "Rewritten", items: [] }] })
    ).rejects.toThrow(/cannot be changed.*sections/s);

    const reread = await store.readDocument(issued.id);
    expect(reread.sections[0].title).toBe("Discovery");
  });

  it("refuses a change of number", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    await expect(store.saveDocument(issued.id, { number: "JURA-2026-09-999" })).rejects.toThrow(/cannot be changed/);
  });

  it("cannot be deleted, only voided", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    await expect(store.deleteDocument(issued.id)).rejects.toThrow(/cannot be deleted/);

    const voided = await store.setStatus(issued.id, "void", { reason: "Raised against the wrong client" });
    expect(voided.status).toBe("void");
    // The number stays with the void document. It is never handed out again.
    expect(voided.number).toBe("JURA-2026-09-001");

    const next = await store.issueDocument((await readyDraft()).id);
    expect(next.number).toBe("JURA-2026-09-002");
  });

  it("still accepts the record of what happened to it", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    const sent = await store.setStatus(issued.id, "sent");
    expect(sent.status).toBe("sent");
    expect(sent.sent_at).toBeTruthy();
  });

  it("lets a draft be deleted, leaving no gap", async () => {
    const draft = await readyDraft();
    await store.deleteDocument(draft.id);
    await expect(store.readDocument(draft.id)).rejects.toThrow(/No document/);

    const next = await store.issueDocument((await readyDraft()).id);
    expect(next.number).toBe("JURA-2026-09-001");
  });
});

describe("payments and receipts", () => {
  it("records part payments and marks the invoice paid when the balance clears", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    expect(computeTotals(issued).amount_due_cents).toBe(360000);

    const first = await store.recordPayment(issued.id, {
      date: "2026-09-20",
      method: "Bank transfer",
      reference: "FT2609201234",
      applied_to: "Part payment",
      amount_cents: 160000,
    });
    expect(computeTotals(first).balance_cents).toBe(200000);
    expect(first.status).toBe("issued");

    const second = await store.recordPayment(issued.id, {
      date: "2026-10-04",
      method: "PayNow",
      applied_to: "Balance",
      amount_cents: 200000,
    });
    expect(computeTotals(second).balance_cents).toBe(0);
    expect(second.status).toBe("paid");
    expect(second.paid_at).toBe("2026-10-04");
  });

  it("generates a receipt that references the invoice and shows a zero balance", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    await store.recordPayment(issued.id, { date: "2026-09-20", amount_cents: 160000, applied_to: "Deposit" });
    await store.recordPayment(issued.id, { date: "2026-10-04", amount_cents: 200000, applied_to: "Balance" });

    const receipt = await store.receiptFromInvoice(issued.id);
    expect(receipt.type).toBe("receipt");
    expect(receipt.number).toBe(null); // still a draft
    expect(receipt.source_number).toBe("JURA-2026-09-001");
    expect(computeTotals(receipt).balance_cents).toBe(0);
    expect(computeTotals(receipt).payments_cents).toBe(360000);

    // Dated the day the last payment landed, not the day it was raised — so it
    // takes its number from October's sequence, not September's.
    expect(receipt.issued_at).toBe("2026-10-04");
    const issuedReceipt = await store.issueDocument(receipt.id);
    expect(issuedReceipt.number).toBe("JURA-R-2026-10-001");

    // Both documents point at each other.
    expect(issuedReceipt.links.invoice_id).toBe(issued.id);
    const invoice = await store.readDocument(issued.id);
    expect(invoice.links.receipt_ids).toContain(issuedReceipt.id);
  });

  it("refuses a payment against a draft", async () => {
    const draft = await readyDraft();
    await expect(store.recordPayment(draft.id, { amount_cents: 1000 })).rejects.toThrow(/Issue the invoice before/);
  });

  it("refuses a zero payment", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    await expect(store.recordPayment(issued.id, { amount_cents: 0 })).rejects.toThrow(/non-zero amount/);
  });

  it("will not unpick payments once a receipt has been issued for them", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    const payment = await store.recordPayment(issued.id, { date: "2026-09-20", amount_cents: 360000 });
    const receipt = await store.receiptFromInvoice(issued.id);
    await store.issueDocument(receipt.id);

    const paymentId = payment.payments[0].id;
    await expect(store.removePayment(issued.id, paymentId)).rejects.toThrow(/receipt has already been issued/);
  });
});

describe("quotation to invoice", () => {
  it("carries the sections across and links both records", async () => {
    const quotation = await store.createDocument({ type: "quotation", client_id: CLIENT.id });
    await store.saveDocument(quotation.id, {
      issued_at: "2026-08-11",
      valid_until: "2026-09-10",
      sections: [
        {
          id: "sec_q",
          title: "Discovery",
          meta: "2 weeks",
          items: [{ id: "itm_q", description: "Process mapping workshops", note: "", qty: 2, unit_price_cents: 120000 }],
        },
      ],
    });
    const issuedQuotation = await store.issueDocument(quotation.id);
    expect(issuedQuotation.number).toBe("JURA-Q-2026-08-001");

    const invoice = await store.invoiceFromQuotation(quotation.id);
    expect(invoice.type).toBe("invoice");
    expect(invoice.sections[0].title).toBe("Discovery");
    expect(computeTotals(invoice).subtotal_cents).toBe(240000);
    expect(invoice.links.quotation_id).toBe(quotation.id);
    // The grant note does not follow onto the invoice — by then the project
    // has commenced and it no longer qualifies.
    expect(invoice.panels).not.toContain("grant_note");

    const reread = await store.readDocument(quotation.id);
    expect(reread.links.invoice_id).toBe(invoice.id);

    await expect(store.invoiceFromQuotation(quotation.id)).rejects.toThrow(/already been converted/);
  });
});

describe("templates", () => {
  it("fills a draft without ever being written back to", async () => {
    const template = await store.saveTemplate({
      name: "Discovery only",
      description: "Workshops and documentation.",
      sections: [
        { title: "Discovery", meta: "", items: [{ description: "Process mapping workshops", note: "", qty: 2, unit_price_cents: null }] },
      ],
    });
    const before = await readFile(join(paths.templates, "discovery-only.json"), "utf8");

    const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id, template });
    expect(doc.sections[0].title).toBe("Discovery");
    // Fresh ids: nothing is shared with the template.
    expect(doc.sections[0].id).not.toBe(template.sections[0].id);

    await store.saveDocument(doc.id, {
      sections: [
        {
          ...doc.sections[0],
          title: "Discovery (revised)",
          items: [{ ...doc.sections[0].items[0], unit_price_cents: 130000 }],
        },
      ],
    });

    const after = await readFile(join(paths.templates, "discovery-only.json"), "utf8");
    expect(after).toBe(before);
  });
});

describe("credit notes", () => {
  it("are raised against an issued invoice and leave it untouched", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    const note = await store.creditNoteFrom(issued.id, { reason: "Workshop billed twice." });
    expect(note.type).toBe("credit_note");
    expect(note.links.corrects_id).toBe(issued.id);
    expect(note.notes).toBe("Workshop billed twice.");

    const creditNumber = await store.issueDocument(note.id);
    expect(creditNumber.number).toBe("JURA-CN-2026-09-001");

    const original = await store.readDocument(issued.id);
    expect(original.sections[0].title).toBe("Discovery");
    expect(original.status).toBe("issued");
  });
});

describe("lookups", () => {
  it("finds a document by its printed number", async () => {
    const issued = await store.issueDocument((await readyDraft()).id);
    const found = await store.findByNumber("JURA-2026-09-001");
    expect(found.id).toBe(issued.id);
    await expect(store.findByNumber("JURA-2026-09-002")).rejects.toThrow(/No document numbered/);
    await expect(store.findByNumber("not-a-number")).rejects.toThrow(/not a Jura document number/);
  });

  it("refuses an id that tries to climb out of the documents folder", async () => {
    await expect(store.readDocument("../../config")).rejects.toThrow(/Bad document id/);
  });
});
