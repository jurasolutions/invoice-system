/**
 * Money is integer cents, everywhere, all the way through.
 *
 * Floats do not represent 0.1 exactly, so a total built by adding dollar
 * amounts drifts. On an invoice that drift is a cent the client did not agree
 * to pay. Every amount in a document record is an integer number of cents, and
 * formatting happens only at the render boundary — these functions.
 *
 * Quantity is the one value that is legitimately fractional (2.5 hours of
 * support). It is carried as thousandths of a unit so the line amount is an
 * integer multiplication, not a float one.
 */

export const QTY_SCALE = 1000;

/** Reject anything that is not a safe integer number of cents. */
export function assertCents(value, label = "amount") {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Quantity as thousandths. `2.5` becomes `2500`.
 * Rounds half away from zero so 0.0005 does not depend on the float's mood.
 */
export function qtyToMilli(qty) {
  if (typeof qty !== "number" || !Number.isFinite(qty)) {
    throw new TypeError(`quantity must be a finite number, got ${JSON.stringify(qty)}`);
  }
  return roundHalfAwayFromZero(qty * QTY_SCALE);
}

export function milliToQty(milli) {
  return milli / QTY_SCALE;
}

/**
 * Round half away from zero, which is what a person does by hand and what a
 * client expects on a line that lands on half a cent. `Math.round` rounds
 * -0.5 to -0 (toward positive infinity), which would quietly favour us on a
 * credit note.
 */
export function roundHalfAwayFromZero(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Line amount in cents from a quantity and a unit price in cents.
 *
 * Both operands are integers before the multiply (`qty_milli * unit_cents`),
 * so the only inexactness is the single divide by 1000 at the end, rounded
 * once. A line of 2.5 × 12000 cents is exactly 30000 cents, not 29999.999.
 */
export function lineAmountCents(qty, unitPriceCents) {
  if (unitPriceCents == null) return 0;
  assertCents(unitPriceCents, "unit price");
  const milli = qtyToMilli(qty ?? 0);
  return roundHalfAwayFromZero((milli * unitPriceCents) / QTY_SCALE);
}

/** Sum of integer cents. Refuses anything that is not already integer cents. */
export function sumCents(values) {
  let total = 0;
  for (const v of values) {
    total += assertCents(v ?? 0, "amount");
  }
  return total;
}

/**
 * Format cents for a document: grouped thousands, always two decimals,
 * negatives in accounting parentheses because that is what a finance team
 * reads without pausing.
 */
export function formatCents(cents, { parensForNegative = true } = {}) {
  assertCents(cents ?? 0, "amount");
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${grouped}.${remainder}`;
  if (!negative) return body;
  return parensForNegative ? `(${body})` : `-${body}`;
}

/** The same number with the currency symbol, for headline figures only. */
export function formatMoney(cents, currency = "SGD") {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const negative = (cents ?? 0) < 0;
  const body = formatCents(Math.abs(cents ?? 0));
  return `${negative ? "(" : ""}${symbol}${body}${negative ? ")" : ""}`;
}

const CURRENCY_SYMBOLS = { SGD: "S$", USD: "US$", MYR: "RM", EUR: "€", GBP: "£" };

/** Format a quantity without trailing zeros: 1, 2.5, 0.25. */
export function formatQty(qty) {
  if (qty == null) return "";
  const rounded = qtyToMilli(qty) / QTY_SCALE;
  return String(rounded);
}

/**
 * Parse a typed money string ("1,200.50", "$1200", "1200") into cents.
 * Returns null for blank so a cleared field stays cleared rather than
 * becoming a zero-dollar line.
 */
export function parseMoneyToCents(input) {
  if (input == null) return null;
  const text = String(input).trim().replace(/[^0-9.,()-]/g, "");
  if (text === "") return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const digits = text.replace(/[(),-]/g, "");
  if (digits === "" || !/^\d*\.?\d*$/.test(digits)) return null;
  const [whole = "0", frac = ""] = digits.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Cents back into an editable string, for a form field. */
export function centsToInput(cents) {
  if (cents == null) return "";
  return formatCents(cents, { parensForNegative: false });
}
