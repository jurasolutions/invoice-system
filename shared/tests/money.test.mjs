import { describe, it, expect } from "vitest";
import {
  lineAmountCents,
  sumCents,
  formatCents,
  formatMoney,
  parseMoneyToCents,
  centsToInput,
  roundHalfAwayFromZero,
  qtyToMilli,
  formatQty,
} from "../src/money.js";

describe("line amounts", () => {
  it("multiplies a whole quantity exactly", () => {
    expect(lineAmountCents(2, 120000)).toBe(240000);
    expect(lineAmountCents(3, 48000)).toBe(144000);
    expect(lineAmountCents(1, 560000)).toBe(560000);
  });

  it("handles a fractional quantity without float drift", () => {
    // 2.5 hours at $120.00. The naive float route gives 29999.999999999996.
    expect(lineAmountCents(2.5, 12000)).toBe(30000);
    expect(lineAmountCents(0.1, 3)).toBe(0);
    expect(lineAmountCents(0.25, 999)).toBe(250);
  });

  it("rounds half away from zero, both directions", () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });

  it("treats a missing price as nothing, not as zero dollars charged", () => {
    expect(lineAmountCents(3, null)).toBe(0);
  });

  it("refuses a unit price that is not integer cents", () => {
    expect(() => lineAmountCents(1, 12.5)).toThrow(/integer number of cents/);
  });

  it("scales quantities to thousandths", () => {
    expect(qtyToMilli(2.5)).toBe(2500);
    expect(qtyToMilli(0.001)).toBe(1);
  });
});

describe("summing", () => {
  it("adds integer cents", () => {
    expect(sumCents([240000, 120000])).toBe(360000);
    expect(sumCents([])).toBe(0);
    expect(sumCents([100, null, 50])).toBe(150);
  });

  it("refuses a float total", () => {
    expect(() => sumCents([1.5, 2])).toThrow(/integer number of cents/);
  });
});

describe("formatting", () => {
  it("groups thousands and always shows two decimals", () => {
    expect(formatCents(1274000)).toBe("12,740.00");
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(100000000)).toBe("1,000,000.00");
  });

  it("uses accounting parentheses for negatives", () => {
    expect(formatCents(-300000)).toBe("(3,000.00)");
    expect(formatCents(-300000, { parensForNegative: false })).toBe("-3,000.00");
  });

  it("puts the currency symbol on headline figures", () => {
    expect(formatMoney(974000)).toBe("S$9,740.00");
    expect(formatMoney(0)).toBe("S$0.00");
    expect(formatMoney(-100, "USD")).toBe("(US$1.00)");
  });

  it("drops trailing zeros from quantities", () => {
    expect(formatQty(1)).toBe("1");
    expect(formatQty(2.5)).toBe("2.5");
    expect(formatQty(0.25)).toBe("0.25");
  });
});

describe("parsing typed money", () => {
  it("reads the shapes a person actually types", () => {
    expect(parseMoneyToCents("1,200.50")).toBe(120050);
    expect(parseMoneyToCents("1200")).toBe(120000);
    expect(parseMoneyToCents("$1,200")).toBe(120000);
    expect(parseMoneyToCents("0.05")).toBe(5);
    expect(parseMoneyToCents("1.2")).toBe(120);
  });

  it("keeps a cleared field cleared rather than making it zero", () => {
    expect(parseMoneyToCents("")).toBe(null);
    expect(parseMoneyToCents("   ")).toBe(null);
    expect(parseMoneyToCents(null)).toBe(null);
    expect(parseMoneyToCents("abc")).toBe(null);
  });

  it("reads a negative both ways", () => {
    expect(parseMoneyToCents("-3000")).toBe(-300000);
    expect(parseMoneyToCents("(3,000.00)")).toBe(-300000);
  });

  it("round-trips through the input format", () => {
    for (const cents of [0, 5, 12345, 1274000, -300000]) {
      expect(parseMoneyToCents(centsToInput(cents))).toBe(cents);
    }
  });
});
