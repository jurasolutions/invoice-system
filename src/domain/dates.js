/**
 * Dates on a document are calendar dates, not instants.
 *
 * An issue date of 6 September is 6 September in Singapore and 6 September on
 * the client's copy in London. Carrying them as `YYYY-MM-DD` strings and doing
 * the arithmetic on the parts avoids the timezone shift that turns an invoice
 * dated the 1st into one dated the 31st.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Today as YYYY-MM-DD in the machine's local zone. */
export function today() {
  return toISODate(new Date());
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isISODate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parts(value).getTime());
}

function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Add whole days to a calendar date, returning a calendar date. */
export function addDays(iso, days) {
  const d = parts(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days between two calendar dates, b − a. */
export function daysBetween(a, b) {
  const MS_PER_DAY = 86400000;
  // Compare at UTC midnight so a daylight-saving boundary between the two
  // dates cannot turn 30 days into 29.96 and round the wrong way.
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** "06 Sep 2026" — the compact form used in the document meta block. */
export function formatShort(iso) {
  if (!isISODate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "6 October 2026" — the long form used in running text. */
export function formatLong(iso) {
  if (!isISODate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Due date from an issue date and a terms window. */
export function dueDate(issuedAt, termsDays) {
  if (!isISODate(issuedAt) || !Number.isInteger(termsDays)) return null;
  return addDays(issuedAt, termsDays);
}
