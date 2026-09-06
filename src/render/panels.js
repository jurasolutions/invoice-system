/**
 * Panel content, resolved.
 *
 * Panel wording lives in `config.json`, not in code. That is a deliberate
 * choice about the grant note above all: Enterprise Singapore is folding EDG,
 * PSG and MRA into a single EDGE scheme through the second half of 2026, and
 * wording baked into a component would need a developer to correct. Wording in
 * config needs a text editor.
 *
 * The cost of that is tokens. `{{number}}` and its friends are filled here.
 * The list below is the whole vocabulary — anything else is left alone rather
 * than silently blanked, so a typo shows up as a typo rather than as a gap.
 */

import { formatLong, formatShort } from "../domain/dates.js";
import { formatMoney } from "../domain/money.js";
import { computeTotals } from "../domain/document.js";

export function panelTokens(doc, config) {
  const totals = computeTotals(doc);
  const currency = doc.currency ?? "SGD";

  return {
    number: doc.number ?? "this document",
    client: doc.client_snapshot?.name ?? "the client",
    company: config?.company?.legal_name ?? "",
    source_number: doc.source_number ?? doc.links?.invoice_id ?? "the invoice",

    issued_at: formatShort(doc.issued_at),
    issued_at_long: formatLong(doc.issued_at),
    due_date: formatShort(doc.due_date),
    due_date_long: formatLong(doc.due_date),
    valid_until: formatShort(doc.valid_until),
    valid_until_long: formatLong(doc.valid_until),

    payment_days: String(doc.terms_days ?? config?.terms?.payment_days ?? 30),
    deposit_percent: String(config?.terms?.deposit_percent ?? 25),

    checked_on: formatShort(config?.panels?.grant_note?.checked_on),
    checked_on_long: formatLong(config?.panels?.grant_note?.checked_on),

    amount_due: formatMoney(totals.amount_due_cents, currency),
    total: formatMoney(totals.net_total_cents, currency),
    received: formatMoney(totals.payments_cents, currency),
    balance: formatMoney(totals.balance_cents, currency),

    // Says what the receipt actually confirms. A receipt for a part payment
    // that claims payment in full is the kind of small untruth that costs a
    // client relationship.
    settlement:
      totals.balance_cents === 0
        ? "payment in full"
        : `payment of ${formatMoney(totals.payments_cents, currency)}`,
  };
}

const TOKEN = /\{\{(\w+)\}\}/g;

export function fillTokens(text, tokens) {
  if (typeof text !== "string") return "";
  return text.replace(TOKEN, (whole, key) => (key in tokens ? tokens[key] : whole));
}

/**
 * Split a paragraph on the phrases the panel wants emphasised, so the renderer
 * can bold them without any HTML living in the config file. Config stays
 * plain text, which is what makes it safe to hand to a non-developer.
 */
export function withEmphasis(text, emphasis = []) {
  if (!emphasis.length) return [{ text, strong: false }];
  const pattern = emphasis
    .filter(Boolean)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!pattern) return [{ text, strong: false }];

  const parts = [];
  const regex = new RegExp(`(${pattern})`, "g");
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), strong: false });
    parts.push({ text: match[0], strong: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false });
  return parts;
}

/** Which panels this document shows, with their content resolved. */
export function resolvePanels(doc, config) {
  const tokens = panelTokens(doc, config);
  return (doc.panels ?? [])
    .map((key) => {
      const source = config?.panels?.[key];
      if (!source) return null;
      if (source.enabled === false) return null;

      // The invoice's notes panel takes the document's own text when it has
      // any, and falls back to the config default when it does not.
      const paragraphs =
        key === "notes" && doc.notes?.trim()
          ? [doc.notes.trim()]
          : (source.paragraphs ?? []);

      if (key === "notes" && paragraphs.length === 0) return null;

      return {
        key,
        heading: fillTokens(source.heading ?? "", tokens),
        paragraphs: paragraphs.map((p) => fillTokens(p, tokens)),
        emphasis: source.emphasis ?? [],
        stamp: source.stamp ? fillTokens(source.stamp, tokens) : null,
        reference_line: source.reference_line ? fillTokens(source.reference_line, tokens) : null,
        signature_labels: (source.signature_labels ?? []).map((l) => fillTokens(l, tokens)),
      };
    })
    .filter(Boolean);
}
