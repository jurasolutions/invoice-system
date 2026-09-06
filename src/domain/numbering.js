/**
 * Document numbering.
 *
 * `JURA-YYYY-MM-NNN` for invoices, with a prefix letter for the other types.
 * The sequence resets on the first of each month, per type.
 *
 * Three rules make the numbers worth trusting, and an auditor will ask about
 * all three:
 *
 *   1. A number is assigned at issue, never at draft. A draft that is deleted
 *      leaves no gap because it never took a number.
 *   2. A number is immutable once assigned. Voiding keeps the number and marks
 *      the record void. Numbers are never reused.
 *   3. Assignment is serialised and the counter write is atomic, so two issues
 *      in the same second cannot collide. That part lives in
 *      `server/numbering.mjs`; the pure rules live here so both sides agree.
 */

export const DOCUMENT_TYPES = ["quotation", "invoice", "receipt", "credit_note"];

export const TYPE_PREFIX = {
  quotation: "JURA-Q-",
  invoice: "JURA-",
  receipt: "JURA-R-",
  credit_note: "JURA-CN-",
};

export const TYPE_LABEL = {
  quotation: "Quotation",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
};

/** The counter period key for a date: "2026-09". */
export function periodKey(date) {
  const d = toDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build the printed number. `seq` is 1-based. Padded to three digits, and
 * allowed to run to four and beyond rather than wrapping — a 1000th invoice in
 * one month should look odd, not look like the first.
 */
export function formatNumber(type, period, seq) {
  const prefix = TYPE_PREFIX[type];
  if (!prefix) throw new Error(`Unknown document type: ${type}`);
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error(`Bad period key: ${period}`);
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error(`Bad sequence: ${seq}`);
  return `${prefix}${period}-${String(seq).padStart(3, "0")}`;
}

/** Take a printed number apart again, for lookups and for the export script. */
export function parseNumber(number) {
  for (const type of DOCUMENT_TYPES) {
    const prefix = TYPE_PREFIX[type];
    if (!number.startsWith(prefix)) continue;
    const rest = number.slice(prefix.length);
    // "JURA-" is also a prefix of "JURA-R-", so a receipt matches the invoice
    // prefix first and leaves "R-2026-10-004". The date pattern rejects it and
    // the loop carries on to the type that actually fits.
    const match = /^(\d{4}-\d{2})-(\d{3,})$/.exec(rest);
    if (!match) continue;
    return { type, period: match[1], seq: Number(match[2]) };
  }
  return null;
}

/**
 * The next counter state and the number that goes with it.
 *
 * Pure: takes the counters object, gives back a new one. The caller is
 * responsible for writing it atomically and for not calling this twice on the
 * same state.
 */
export function nextNumber(counters, type, date) {
  if (!TYPE_PREFIX[type]) throw new Error(`Unknown document type: ${type}`);
  const period = periodKey(date);
  const forType = counters[type] ?? {};
  const current = forType[period] ?? 0;
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new Error(`Counter for ${type} ${period} is not a whole number: ${JSON.stringify(current)}`);
  }
  const seq = current + 1;
  return {
    number: formatNumber(type, period, seq),
    counters: { ...counters, [type]: { ...forType, [period]: seq } },
    period,
    seq,
  };
}

/** A fresh counter file. Every type present, every type empty. */
export function emptyCounters() {
  return Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, {}]));
}

/**
 * Check a counters file before trusting it. A corrupted counter is the one
 * failure that must never be papered over: guessing produces a duplicate
 * number, and a duplicate number is worse than a refused issue.
 */
export function validateCounters(counters) {
  const problems = [];
  if (counters === null || typeof counters !== "object" || Array.isArray(counters)) {
    return ["counters.json is not an object"];
  }
  for (const [type, periods] of Object.entries(counters)) {
    if (!DOCUMENT_TYPES.includes(type)) {
      problems.push(`unknown document type "${type}"`);
      continue;
    }
    if (periods === null || typeof periods !== "object" || Array.isArray(periods)) {
      problems.push(`counters.${type} is not an object`);
      continue;
    }
    for (const [period, value] of Object.entries(periods)) {
      if (!/^\d{4}-\d{2}$/.test(period)) problems.push(`counters.${type} has a bad period key "${period}"`);
      if (!Number.isSafeInteger(value) || value < 0) {
        problems.push(`counters.${type}.${period} is not a whole number (${JSON.stringify(value)})`);
      }
    }
  }
  for (const type of DOCUMENT_TYPES) {
    if (!(type in counters)) problems.push(`counters.json is missing "${type}"`);
  }
  return problems;
}

function toDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === "string") {
    // Treat a bare YYYY-MM-DD as a local calendar date. `new Date("2026-09-01")`
    // parses as UTC midnight, which in SGT is still 08:00 on the 1st but in a
    // negative-offset zone would be the 31st of the month before — and this
    // decides which month's sequence a document takes.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(date);
  }
  if (date == null) return new Date();
  return new Date(date);
}
