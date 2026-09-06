import { describe, it, expect } from "vitest";
import {
  computeTotals,
  validateForIssue,
  frozenFieldsTouched,
  canTransition,
  blankDocument,
  snapshotClient,
  grantNoteAge,
  isIssued,
} from "../src/document.js";
import { defaultConfig } from "../src/defaults/config.js";
import { specimenDocuments } from "../src/defaults/specimen.js";
import { formatMoney } from "../src/money.js";

const { documents } = specimenDocuments();
const specimenInvoice = documents.find((d) => d.type === "invoice");
const specimenQuotation = documents.find((d) => d.type === "quotation");
const specimenReceipt = documents.find((d) => d.type === "receipt");

describe("totals — the hand-worked example from the concept", () => {
  const totals = computeTotals(specimenInvoice);

  it("gets each section subtotal to the cent", () => {
    // Discovery:  2 × 1,200.00  +  1 × 1,200.00  =  3,600.00
    // Build:      1 × 5,600.00  +  3 × 480.00  +  1 × 1,100.00  =  8,140.00
    // Handover:   1 × 600.00    +  1 × 400.00  =  1,000.00
    expect(totals.sections.map((s) => s.subtotal_cents)).toEqual([360000, 814000, 100000]);
  });

  it("adds up to the printed subtotal", () => {
    expect(totals.subtotal_cents).toBe(1274000);
    expect(formatMoney(totals.subtotal_cents)).toBe("S$12,740.00");
  });

  it("charges no GST while Jura is not registered", () => {
    expect(totals.gst_registered).toBe(false);
    expect(totals.gst_cents).toBe(0);
    expect(totals.total_cents).toBe(1274000);
  });

  it("takes the deposit off the face of the invoice", () => {
    expect(totals.adjustments_cents).toBe(-300000);
    expect(totals.amount_due_cents).toBe(974000);
    expect(formatMoney(totals.amount_due_cents)).toBe("S$9,740.00");
  });

  it("does not count the deposit twice against the balance", () => {
    // The deposit is both an adjustment on the face and a payment record.
    // Counted naively the balance would come out 300,000 cents short.
    expect(totals.payments_cents).toBe(1274000);
    expect(totals.net_total_cents).toBe(1274000);
    expect(totals.balance_cents).toBe(0);
    expect(totals.fully_paid).toBe(true);
  });
});

describe("totals — GST behind the flag", () => {
  it("computes GST on the subtotal once registered", () => {
    const registered = { ...specimenInvoice, gst: { registered: true, rate_bp: 900, number: "M9-1234567-8" } };
    const totals = computeTotals(registered);
    expect(totals.gst_cents).toBe(114660); // 9% of 12,740.00
    expect(totals.total_cents).toBe(1388660);
    expect(totals.amount_due_cents).toBe(1088660);
  });

  it("rounds GST to the cent, half away from zero", () => {
    const doc = {
      gst: { registered: true, rate_bp: 900 },
      sections: [{ id: "s", items: [{ id: "i", qty: 1, unit_price_cents: 5 }] }],
      adjustments: [],
      payments: [],
    };
    // 9% of 5 cents is 0.45 of a cent.
    expect(computeTotals(doc).gst_cents).toBe(0);
    doc.sections[0].items[0].unit_price_cents = 6; // 0.54 of a cent
    expect(computeTotals(doc).gst_cents).toBe(1);
  });
});

describe("totals — a discount is not a deposit", () => {
  it("reduces what is owed, not just what the face asks for", () => {
    const discounted = {
      ...specimenInvoice,
      adjustments: [
        { id: "adj_1", label: "Less deposit paid 18 Aug 2026", amount_cents: -300000, payment_id: "pay_specimen_deposit" },
        { id: "adj_2", label: "Goodwill discount", amount_cents: -40000, payment_id: null },
      ],
      payments: [specimenInvoice.payments[0]],
    };
    const totals = computeTotals(discounted);
    expect(totals.amount_due_cents).toBe(934000); // 12,740 − 3,000 − 400
    expect(totals.net_total_cents).toBe(1234000); // 12,740 − 400
    expect(totals.balance_cents).toBe(934000); // less the 3,000 deposit paid
  });
});

describe("the receipt balances against the invoice", () => {
  it("shows everything received and nothing outstanding", () => {
    const totals = computeTotals(specimenReceipt);
    expect(totals.subtotal_cents).toBe(1274000);
    expect(totals.payments_cents).toBe(1274000);
    expect(totals.balance_cents).toBe(0);
  });

  it("restates the invoice one line per section", () => {
    expect(specimenReceipt.sections[0].items.map((i) => i.unit_price_cents)).toEqual([360000, 814000, 100000]);
  });
});

describe("a client edit does not reach a document that has gone out", () => {
  it("keeps the address as it was on the day it was issued", () => {
    const client = {
      id: "cli_1",
      name: "Northbridge Dental Group Pte. Ltd.",
      attention: "Rachel Ong, operations manager",
      address_lines: ["18 Kallang Avenue, #07-12", "Singapore 339410"],
      email: "accounts@northbridgedental.example",
    };
    const snapshot = snapshotClient(client);

    // They move office, and the client record is updated.
    client.address_lines.push("Level 4");
    client.address_lines[0] = "22 Somewhere Else";
    client.name = "Northbridge Dental Group Holdings Pte. Ltd.";

    expect(snapshot.address_lines).toEqual(["18 Kallang Avenue, #07-12", "Singapore 339410"]);
    expect(snapshot.name).toBe("Northbridge Dental Group Pte. Ltd.");
  });
});

describe("an issued document is frozen", () => {
  it("knows it has been issued", () => {
    expect(isIssued(specimenInvoice)).toBe(true);
    expect(isIssued({ number: null, status: "draft" })).toBe(false);
  });

  it("names the content fields a caller tried to change", () => {
    const edited = {
      ...specimenInvoice,
      sections: [{ ...specimenInvoice.sections[0], title: "Discovery (revised)" }],
      reference: "PO-9999",
    };
    expect(frozenFieldsTouched(specimenInvoice, edited).sort()).toEqual(["reference", "sections"]);
  });

  it("still allows what happened to it afterwards", () => {
    const paid = { ...specimenInvoice, status: "paid", payments: [...specimenInvoice.payments], updated_at: "later" };
    expect(frozenFieldsTouched(specimenInvoice, paid)).toEqual([]);
  });

  it("will not let a number be rewritten", () => {
    const renumbered = { ...specimenInvoice, number: "JURA-2026-09-999" };
    expect(frozenFieldsTouched(specimenInvoice, renumbered)).toContain("number");
  });
});

describe("status transitions", () => {
  it("follows the flow for the type", () => {
    expect(canTransition({ type: "invoice", status: "issued" }, "paid")).toBe(true);
    expect(canTransition({ type: "invoice", status: "draft" }, "paid")).toBe(false);
    expect(canTransition({ type: "receipt", status: "issued" }, "paid")).toBe(false);
    expect(canTransition({ type: "quotation", status: "sent" }, "accepted")).toBe(true);
    expect(canTransition({ type: "invoice", status: "void" }, "paid")).toBe(false);
  });
});

describe("what has to be true before a document can be issued", () => {
  const config = defaultConfig();

  it("blocks a draft with no client, no items and a placeholder UEN", () => {
    const draft = blankDocument("invoice", config);
    const problems = validateForIssue(draft, config);
    expect(problems.join(" ")).toMatch(/Pick a client/);
    expect(problems.join(" ")).toMatch(/needs a title|needs a description|no unit price/);
    expect(problems.join(" ")).toMatch(/placeholder UEN/);
  });

  it("refuses to issue something that already has a number", () => {
    expect(validateForIssue(specimenInvoice, config).join(" ")).toMatch(/Already issued/);
  });

  it("passes a complete draft once the company details are confirmed", () => {
    const ready = {
      ...specimenInvoice,
      id: "doc_draft",
      number: null,
      status: "draft",
      payments: [],
      adjustments: [],
    };
    const confirmed = {
      ...config,
      company: { ...config.company, uen: "202612345K", uen_confirmed: true },
    };
    expect(validateForIssue(ready, confirmed)).toEqual([]);
  });

  it("will not issue a receipt with no payments on it", () => {
    const receipt = { ...specimenReceipt, number: null, status: "draft", payments: [] };
    expect(validateForIssue(receipt, config).join(" ")).toMatch(/needs at least one recorded payment/);
  });

  it("will not turn GST on without a registration number", () => {
    const draft = {
      ...specimenQuotation,
      number: null,
      status: "draft",
      gst: { registered: true, rate_bp: 900, number: null },
    };
    expect(validateForIssue(draft, config).join(" ")).toMatch(/no GST registration number/);
  });
});

describe("the grant note goes stale on purpose", () => {
  const config = defaultConfig({ checkedOn: "2026-09-06" });

  it("is fine the day it was checked", () => {
    expect(grantNoteAge(config, "2026-09-06")).toMatchObject({ days: 0, stale: false, missing: false });
  });

  it("is fine at 180 days and stale at 181", () => {
    expect(grantNoteAge(config, "2027-03-05").stale).toBe(false); // 180 days
    expect(grantNoteAge(config, "2027-03-06").stale).toBe(true); // 181
  });

  it("treats a missing date as stale rather than as fine", () => {
    const noDate = { ...config, panels: { ...config.panels, grant_note: { checked_on: null } } };
    expect(grantNoteAge(noDate, "2026-09-06")).toMatchObject({ missing: true, stale: true });
  });
});

describe("a new draft", () => {
  const config = defaultConfig();

  it("has no number, because a deleted draft must not leave a gap", () => {
    const draft = blankDocument("invoice", config);
    expect(draft.number).toBe(null);
    expect(draft.status).toBe("draft");
  });

  it("takes the terms from config and works out the due date", () => {
    const draft = blankDocument("invoice", config, { issued_at: "2026-09-06" });
    expect(draft.terms_days).toBe(30);
    expect(draft.due_date).toBe("2026-10-06");
  });

  it("puts the grant note on a quotation and nowhere else", () => {
    expect(blankDocument("quotation", config).panels).toContain("grant_note");
    expect(blankDocument("invoice", config).panels).not.toContain("grant_note");
    expect(blankDocument("receipt", config).panels).not.toContain("grant_note");
  });

  it("snapshots the GST position rather than reading it live", () => {
    const draft = blankDocument("invoice", config);
    expect(draft.gst).toEqual({ registered: false, rate_bp: 900, number: null });
  });
});
