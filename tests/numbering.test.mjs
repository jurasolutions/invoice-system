import { describe, it, expect } from "vitest";
import {
  formatNumber,
  parseNumber,
  nextNumber,
  periodKey,
  emptyCounters,
  validateCounters,
} from "../src/domain/numbering.js";

describe("number format", () => {
  it("uses the right prefix per type", () => {
    expect(formatNumber("invoice", "2026-09", 1)).toBe("JURA-2026-09-001");
    expect(formatNumber("quotation", "2026-08", 2)).toBe("JURA-Q-2026-08-002");
    expect(formatNumber("receipt", "2026-10", 4)).toBe("JURA-R-2026-10-004");
    expect(formatNumber("credit_note", "2026-10", 1)).toBe("JURA-CN-2026-10-001");
  });

  it("pads to three digits and then keeps growing", () => {
    expect(formatNumber("invoice", "2026-09", 9)).toBe("JURA-2026-09-009");
    expect(formatNumber("invoice", "2026-09", 999)).toBe("JURA-2026-09-999");
    expect(formatNumber("invoice", "2026-09", 1000)).toBe("JURA-2026-09-1000");
  });

  it("reads its own numbers back, and tells the types apart", () => {
    // "JURA-" is a prefix of "JURA-R-", so this is the case that would break a
    // naive startsWith check.
    expect(parseNumber("JURA-R-2026-10-004")).toEqual({ type: "receipt", period: "2026-10", seq: 4 });
    expect(parseNumber("JURA-2026-09-001")).toEqual({ type: "invoice", period: "2026-09", seq: 1 });
    expect(parseNumber("JURA-Q-2026-08-002")).toEqual({ type: "quotation", period: "2026-08", seq: 2 });
    expect(parseNumber("JURA-CN-2026-10-001")).toEqual({ type: "credit_note", period: "2026-10", seq: 1 });
    expect(parseNumber("INV-001")).toBe(null);
  });
});

describe("period keys", () => {
  it("takes a bare date as a local calendar date", () => {
    // new Date("2026-09-01") is UTC midnight. West of Greenwich that is still
    // 31 August, which would file the document in the wrong month's sequence.
    expect(periodKey("2026-09-01")).toBe("2026-09");
    expect(periodKey("2026-12-31")).toBe("2026-12");
    expect(periodKey("2027-01-01")).toBe("2027-01");
  });
});

describe("assigning the next number", () => {
  it("starts at 001 for a type that has never been used", () => {
    const { number, counters } = nextNumber(emptyCounters(), "invoice", "2026-09-06");
    expect(number).toBe("JURA-2026-09-001");
    expect(counters.invoice["2026-09"]).toBe(1);
  });

  it("increments within the month", () => {
    let counters = emptyCounters();
    const numbers = [];
    for (let i = 0; i < 3; i++) {
      const next = nextNumber(counters, "invoice", "2026-09-06");
      counters = next.counters;
      numbers.push(next.number);
    }
    expect(numbers).toEqual(["JURA-2026-09-001", "JURA-2026-09-002", "JURA-2026-09-003"]);
  });

  it("resets on the first of the next month, and leaves the old month alone", () => {
    let counters = emptyCounters();
    counters = nextNumber(counters, "invoice", "2026-09-28").counters;
    counters = nextNumber(counters, "invoice", "2026-09-30").counters;
    expect(counters.invoice["2026-09"]).toBe(2);

    const october = nextNumber(counters, "invoice", "2026-10-01");
    expect(october.number).toBe("JURA-2026-10-001");
    expect(october.counters.invoice["2026-09"]).toBe(2);
    expect(october.counters.invoice["2026-10"]).toBe(1);
  });

  it("keeps a separate sequence per type in the same month", () => {
    let counters = emptyCounters();
    const invoice = nextNumber(counters, "invoice", "2026-09-06");
    const quotation = nextNumber(invoice.counters, "quotation", "2026-09-06");
    expect(invoice.number).toBe("JURA-2026-09-001");
    expect(quotation.number).toBe("JURA-Q-2026-09-001");
  });

  it("refuses to guess past a counter that is not a whole number", () => {
    expect(() => nextNumber({ invoice: { "2026-09": 1.5 } }, "invoice", "2026-09-06")).toThrow(/whole number/);
    expect(() => nextNumber({ invoice: { "2026-09": "3" } }, "invoice", "2026-09-06")).toThrow(/whole number/);
  });

  it("does not mutate the counters it was given", () => {
    const counters = emptyCounters();
    nextNumber(counters, "invoice", "2026-09-06");
    expect(counters.invoice).toEqual({});
  });
});

describe("validating a counters file", () => {
  it("accepts a healthy one", () => {
    expect(validateCounters(emptyCounters())).toEqual([]);
    expect(validateCounters({ ...emptyCounters(), invoice: { "2026-09": 3 } })).toEqual([]);
  });

  it("names what is wrong rather than repairing it", () => {
    expect(validateCounters(null)).toContain("counters.json is not an object");
    expect(validateCounters("nope")).toContain("counters.json is not an object");

    const negative = validateCounters({ ...emptyCounters(), invoice: { "2026-09": -1 } });
    expect(negative.join(" ")).toMatch(/not a whole number/);

    const badPeriod = validateCounters({ ...emptyCounters(), invoice: { "sept": 1 } });
    expect(badPeriod.join(" ")).toMatch(/bad period key/);

    const missing = validateCounters({ invoice: {} });
    expect(missing.join(" ")).toMatch(/missing "quotation"/);
  });
});
