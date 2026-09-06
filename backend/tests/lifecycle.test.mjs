/**
 * The whole life of a job, from quotation to receipt, through the same calls
 * the app makes.
 *
 * The other test files check the rules one at a time. This one checks that
 * they still hold when strung together, which is where a system like this
 * usually comes apart: a number assigned twice on the way from quotation to
 * invoice, a receipt that does not balance because a deposit was counted at
 * both ends, an edit that slips through because it happened via a different
 * route.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "jura-lifecycle-"));
process.env.JURA_DATA_PATH = join(root, "data/invoices");
process.env.JURA_OUTPUT_PATH = join(root, "outputs");

const store = await import("../src/store.mjs");
const { paths } = await import("../src/paths.mjs");
const { writeJsonAtomic } = await import("../src/atomic.mjs");
const { defaultConfig } = await import("@jura/shared/defaults/config.js");
const { seedTemplates } = await import("@jura/shared/defaults/templates.js");
const { emptyCounters } = await import("@jura/shared/numbering.js");
const { computeTotals } = await import("@jura/shared/document.js");
const { formatMoney } = await import("@jura/shared/money.js");

const CLIENT = {
  id: "cli_lifecycle",
  name: "Northbridge Dental Group Pte. Ltd.",
  attention: "Rachel Ong, operations manager",
  address_lines: ["18 Kallang Avenue, #07-12", "Singapore 339410"],
  email: "accounts@northbridgedental.example",
};

beforeEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
  await store.ensureDataTree();
  const config = defaultConfig();
  config.company.uen = "202612345K";
  config.company.uen_confirmed = true;
  config.company.address_confirmed = true;
  await writeJsonAtomic(paths.config, config);
  await writeJsonAtomic(paths.counters, emptyCounters());
  await writeJsonAtomic(paths.clients, [CLIENT]);
  for (const { slug, ...rest } of seedTemplates) {
    await store.saveTemplate({ slug, ...rest });
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("quotation → invoice → payments → receipt", () => {
  it("keeps the numbers, the links and the arithmetic straight the whole way", async () => {
    const templates = await store.listTemplates();
    const template = templates.find((t) => t.slug === "first-automation-build");

    // ---- quote it -------------------------------------------------------
    const quotation = await store.createDocument({
      type: "quotation",
      client_id: CLIENT.id,
      template,
    });
    expect(quotation.sections).toHaveLength(3);
    expect(quotation.number).toBe(null);
    // The shipped templates carry structure but no rates, on purpose.
    expect(quotation.sections.flatMap((s) => s.items).every((i) => i.unit_price_cents === null)).toBe(true);

    // Put the rates in, the way the builder would.
    const priced = await store.saveDocument(quotation.id, {
      issued_at: "2026-08-11",
      valid_until: "2026-09-10",
      reference: "PO-4417",
      sections: quotation.sections.map((section, index) => ({
        ...section,
        items: section.items.map((item, itemIndex) => ({
          ...item,
          unit_price_cents: [120000, 560000, 60000][index] + itemIndex * 10000,
        })),
      })),
    });

    const issuedQuotation = await store.issueDocument(priced.id);
    expect(issuedQuotation.number).toBe("JURA-Q-2026-08-001");
    const quotedTotal = computeTotals(issuedQuotation).amount_due_cents;
    expect(quotedTotal).toBeGreaterThan(0);

    await store.setStatus(issuedQuotation.id, "sent");
    await store.setStatus(issuedQuotation.id, "accepted");

    // ---- convert and invoice it ----------------------------------------
    const invoiceDraft = await store.invoiceFromQuotation(issuedQuotation.id);
    expect(computeTotals(invoiceDraft).amount_due_cents).toBe(quotedTotal);
    expect(invoiceDraft.panels).not.toContain("grant_note");

    const withDeposit = await store.saveDocument(invoiceDraft.id, {
      issued_at: "2026-09-06",
      due_date: "2026-10-06",
    });
    const invoice = await store.issueDocument(withDeposit.id);
    expect(invoice.number).toBe("JURA-2026-09-001");

    // ---- get paid, in two goes -----------------------------------------
    const deposit = Math.round(quotedTotal * 0.25);
    await store.recordPayment(invoice.id, {
      date: "2026-09-20",
      method: "Bank transfer",
      reference: "FT2609201234",
      applied_to: "Deposit",
      amount_cents: deposit,
    });

    const afterFirst = await store.readDocument(invoice.id);
    expect(computeTotals(afterFirst).balance_cents).toBe(quotedTotal - deposit);
    expect(afterFirst.status).toBe("issued");

    await store.recordPayment(invoice.id, {
      date: "2026-10-04",
      method: "PayNow",
      applied_to: "Balance",
      amount_cents: quotedTotal - deposit,
    });

    const settled = await store.readDocument(invoice.id);
    expect(computeTotals(settled).balance_cents).toBe(0);
    expect(settled.status).toBe("paid");

    // ---- receipt it -----------------------------------------------------
    const receiptDraft = await store.receiptFromInvoice(invoice.id);
    const receipt = await store.issueDocument(receiptDraft.id);
    expect(receipt.number).toBe("JURA-R-2026-10-001");

    const receiptTotals = computeTotals(receipt);
    expect(receiptTotals.payments_cents).toBe(quotedTotal);
    expect(receiptTotals.balance_cents).toBe(0);
    expect(formatMoney(receiptTotals.balance_cents)).toBe("S$0.00");

    // ---- everything points at everything else ---------------------------
    const finalInvoice = await store.readDocument(invoice.id);
    const finalQuotation = await store.readDocument(issuedQuotation.id);
    expect(finalQuotation.links.invoice_id).toBe(invoice.id);
    expect(finalInvoice.links.quotation_id).toBe(issuedQuotation.id);
    expect(finalInvoice.links.receipt_ids).toContain(receipt.id);
    expect(receipt.links.invoice_id).toBe(invoice.id);
    expect(receipt.source_number).toBe("JURA-2026-09-001");

    // ---- and none of it can be edited now -------------------------------
    await expect(store.saveDocument(invoice.id, { reference: "PO-9999" })).rejects.toThrow(/cannot be changed/);
    await expect(store.saveDocument(receipt.id, { sections: [] })).rejects.toThrow(/cannot be changed/);

    // Three documents, three sequences, no gaps.
    const counters = JSON.parse(await readFile(paths.counters, "utf8"));
    expect(counters).toMatchObject({
      quotation: { "2026-08": 1 },
      invoice: { "2026-09": 1 },
      receipt: { "2026-10": 1 },
    });
  });
});

describe("a draft survives being edited and reloaded", () => {
  it("keeps hand-added sections, added items, a reorder and a removal", async () => {
    const templates = await store.listTemplates();
    const template = templates.find((t) => t.slug === "discovery-only");
    const templateFile = join(paths.templates, "discovery-only.json");
    const before = await readFile(templateFile, "utf8");

    const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id, template });
    expect(doc.sections).toHaveLength(1);

    // Add a section with two items by hand.
    const added = await store.saveDocument(doc.id, {
      sections: [
        ...doc.sections,
        {
          id: "sec_added",
          title: "Added by hand",
          meta: "This week",
          items: [
            { id: "itm_a", description: "First hand-added item", note: "", qty: 1, unit_price_cents: 50000 },
            { id: "itm_b", description: "Second hand-added item", note: "A note.", qty: 2, unit_price_cents: 25000 },
          ],
        },
      ],
    });
    expect(added.sections).toHaveLength(2);

    // Reorder: the hand-added section goes first.
    const reordered = await store.saveDocument(doc.id, {
      sections: [added.sections[1], added.sections[0]],
    });
    expect(reordered.sections[0].title).toBe("Added by hand");

    // Remove one of the hand-added items.
    const trimmed = await store.saveDocument(doc.id, {
      sections: reordered.sections.map((section) =>
        section.id === "sec_added" ? { ...section, items: section.items.filter((i) => i.id !== "itm_a") } : section
      ),
    });

    // Reload from disk, as a browser refresh would.
    const reloaded = await store.readDocument(doc.id);
    expect(reloaded.sections[0].title).toBe("Added by hand");
    expect(reloaded.sections[0].items.map((i) => i.id)).toEqual(["itm_b"]);
    expect(reloaded.sections[0].items[0].note).toBe("A note.");
    expect(reloaded.sections[1].title).toBe("Discovery");
    expect(computeTotals(reloaded).subtotal_cents).toBe(50000); // 2 × 250.00

    // And the template it came from is untouched, byte for byte.
    expect(await readFile(templateFile, "utf8")).toBe(before);
  });

  it("saves a template from a document without carrying the client across", async () => {
    const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id });
    await store.saveDocument(doc.id, {
      sections: [
        {
          id: "sec_1",
          title: "Retainer",
          meta: "September",
          items: [{ id: "itm_1", description: "Monthly retainer", note: "", qty: 1, unit_price_cents: 200000 }],
        },
      ],
    });
    const current = await store.readDocument(doc.id);

    const saved = await store.saveTemplate({
      name: "September retainer",
      description: "Saved from a draft.",
      document_type: "invoice",
      sections: current.sections.map((section) => ({
        title: section.title,
        meta: "",
        items: section.items.map((item) => ({
          description: item.description,
          note: item.note,
          qty: item.qty,
          unit_price_cents: item.unit_price_cents,
        })),
      })),
    });

    const written = JSON.parse(await readFile(join(paths.templates, "september-retainer.json"), "utf8"));
    expect(written.sections[0].items[0].unit_price_cents).toBe(200000);
    expect(JSON.stringify(written)).not.toContain("Northbridge");
    expect(saved.slug).toBe("september-retainer");
  });
});

describe("a credit note corrects an invoice without touching it", () => {
  it("takes its own number and leaves the original as issued", async () => {
    const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id });
    await store.saveDocument(doc.id, {
      issued_at: "2026-09-06",
      due_date: "2026-10-06",
      sections: [
        {
          id: "sec_1",
          title: "Discovery",
          meta: "",
          items: [{ id: "itm_1", description: "Workshops", note: "", qty: 2, unit_price_cents: 120000 }],
        },
      ],
    });
    const invoice = await store.issueDocument(doc.id);

    const note = await store.creditNoteFrom(invoice.id, { reason: "The second workshop was billed twice." });
    const issuedNote = await store.issueDocument(note.id);
    expect(issuedNote.number).toBe("JURA-CN-2026-09-001");

    const original = await store.readDocument(invoice.id);
    expect(original.number).toBe("JURA-2026-09-001");
    expect(original.status).toBe("issued");
    expect(computeTotals(original).amount_due_cents).toBe(240000);
  });
});
