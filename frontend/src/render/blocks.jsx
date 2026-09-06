/**
 * The pieces a document is built from.
 *
 * Each one is a plain function of the record — no state, no fetching, nothing
 * that behaves differently in the preview than it does on paper. The
 * paginator measures these, decides which page each lands on, and renders the
 * same nodes again into the page boxes.
 */
import React from "react";

import { Logo } from "../design-system/components/brand/Logo.jsx";
import { formatCents, formatMoney, formatQty } from "@jura/shared/money.js";
import { formatLong, formatShort } from "@jura/shared/dates.js";
import { computeTotals, TYPE_LABEL } from "@jura/shared/document.js";
import { withEmphasis } from "./panels.js";

// ------------------------------------------------------------------- header

/** What sits under the document title. Never says "tax invoice" while GST is off. */
export function documentSubtitle(doc, config) {
  const registered = doc.gst?.registered;
  switch (doc.type) {
    case "invoice":
      return registered
        ? `Tax invoice · GST reg. ${doc.gst.number}`
        : config?.gst?.not_registered_line ?? "Not a tax invoice · Jura is not GST-registered";
    case "quotation": {
      const days = daysValid(doc);
      return `${days ? `Valid ${days} days · ` : ""}prices in ${doc.currency ?? "SGD"}`;
    }
    case "receipt":
      return registered ? "Payment received" : "Payment received · no GST charged";
    case "credit_note":
      return `Correction to ${doc.source_number ?? "an earlier invoice"}`;
    default:
      return "";
  }
}

function daysValid(doc) {
  if (!doc.issued_at || !doc.valid_until) return null;
  const [ay, am, ad] = doc.issued_at.split("-").map(Number);
  const [by, bm, bd] = doc.valid_until.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function metaRows(doc) {
  const label = TYPE_LABEL[doc.type];
  const rows = [[`${label} no.`, doc.number ?? "Not yet issued", true]];

  switch (doc.type) {
    case "invoice":
      rows.push(["Issue date", formatShort(doc.issued_at)]);
      if (doc.due_date) rows.push(["Due date", formatShort(doc.due_date)]);
      if (doc.terms_days != null) rows.push(["Terms", `Net ${doc.terms_days}`]);
      break;
    case "quotation":
      rows.push(["Issue date", formatShort(doc.issued_at)]);
      if (doc.valid_until) rows.push(["Valid until", formatShort(doc.valid_until)]);
      if (doc.prepared_by) rows.push(["Prepared by", doc.prepared_by]);
      break;
    case "receipt":
      rows.push(["Receipt date", formatShort(doc.issued_at)]);
      if (doc.source_number) rows.push(["For invoice", doc.source_number]);
      if (doc.source_issued_at) rows.push(["Invoice date", formatShort(doc.source_issued_at)]);
      break;
    case "credit_note":
      rows.push(["Issue date", formatShort(doc.issued_at)]);
      if (doc.source_number) rows.push(["Against invoice", doc.source_number]);
      break;
    default:
      break;
  }

  if (doc.reference) rows.push(["Your reference", doc.reference]);
  return rows;
}

export function DocHead({ doc, config }) {
  return (
    <header className="ju-head">
      <Logo size={36} showTagline />
      <div className="ju-head-right">
        <div className="ju-doc-title">{TYPE_LABEL[doc.type]}</div>
        <div className="ju-doc-sub">{documentSubtitle(doc, config)}</div>
        <dl className="ju-meta">
          {metaRows(doc).map(([label, value, isKey]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd className={isKey ? "is-key" : undefined}>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </header>
  );
}

/**
 * The header on every page after the first.
 *
 * It carries the document number, because a page that gets separated from
 * page one has to be identifiable on its own.
 */
export function ContHead({ doc }) {
  return (
    <div className="ju-cont">
      <div className="ju-cont-who">
        <Logo variant="mark" size={26} />
        <b>
          {TYPE_LABEL[doc.type]} · {doc.client_snapshot?.name ?? ""}
        </b>
      </div>
      <div className="ju-cont-right">
        Continued
        <em>{doc.number ?? "Draft"}</em>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ parties

const PARTY_LABELS = {
  invoice: ["Billed to", "From"],
  quotation: ["Prepared for", "From"],
  receipt: ["Received from", "Received by"],
  credit_note: ["Credited to", "From"],
};

export function Parties({ doc, config }) {
  const [toLabel, fromLabel] = PARTY_LABELS[doc.type] ?? PARTY_LABELS.invoice;
  const client = doc.client_snapshot ?? {};
  // An issued document shows the company as it was on the day; a draft shows
  // it as it is now, so an edit to config is visible in the preview.
  const company = doc.company_snapshot ?? config?.company ?? {};

  return (
    <div className="ju-parties">
      <div className="ju-party">
        <div className="ju-eyebrow">{toLabel}</div>
        <strong>{client.name || "No client selected"}</strong>
        <p>
          {client.attention ? <>Attn: {client.attention}<br /></> : null}
          {(client.address_lines ?? []).map((line) => (
            <React.Fragment key={line}>
              {line}
              <br />
            </React.Fragment>
          ))}
          {client.email}
        </p>
      </div>
      <div className="ju-party">
        <div className="ju-eyebrow">{fromLabel}</div>
        <strong>{company.legal_name}</strong>
        <p>
          <span className={company.uen_confirmed ? undefined : "ju-tbc"}>
            {company.uen_confirmed ? `UEN ${company.uen}` : company.uen}
          </span>
          <br />
          {(company.address_lines ?? []).map((line) => (
            <React.Fragment key={line}>
              <span className={company.address_confirmed ? undefined : "ju-tbc"}>{line}</span>
              <br />
            </React.Fragment>
          ))}
          {company.email}
          {company.website ? ` · ${company.website}` : ""}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ amount strip

export function AmountStrip({ doc }) {
  const totals = computeTotals(doc);
  const currency = doc.currency ?? "SGD";

  if (doc.type === "receipt") {
    const paidInFull = totals.balance_cents === 0;
    return (
      <div className="ju-strip ju-strip--paid">
        <div>
          <div className="ju-strip-label">Payment received</div>
          <div className="ju-strip-figure">{formatMoney(totals.payments_cents, currency)}</div>
        </div>
        <div className="ju-strip-right">
          <span className={paidInFull ? "ju-pill" : "ju-pill ju-pill--quiet"}>
            {paidInFull ? "Paid in full" : "Part payment"}
          </span>
          <b>Balance {formatMoney(totals.balance_cents, currency)}</b>
        </div>
      </div>
    );
  }

  if (doc.type === "quotation") {
    return (
      <div className="ju-strip">
        <div>
          <div className="ju-strip-label">Quoted total</div>
          <div className="ju-strip-figure">{formatMoney(totals.amount_due_cents, currency)}</div>
        </div>
        <div className="ju-strip-right">
          <span className="ju-pill ju-pill--quiet">
            {doc.status === "accepted" ? "Accepted" : "Awaiting acceptance"}
          </span>
          {doc.valid_until ? <b>Valid until {formatShort(doc.valid_until)}</b> : null}
        </div>
      </div>
    );
  }

  if (doc.type === "credit_note") {
    return (
      <div className="ju-strip">
        <div>
          <div className="ju-strip-label">Amount credited</div>
          <div className="ju-strip-figure">{formatMoney(Math.abs(totals.amount_due_cents), currency)}</div>
        </div>
        <div className="ju-strip-right">
          Against
          <b>{doc.source_number ?? ""}</b>
        </div>
      </div>
    );
  }

  return (
    <div className="ju-strip">
      <div>
        <div className="ju-strip-label">Amount due</div>
        <div className="ju-strip-figure">{formatMoney(totals.amount_due_cents, currency)}</div>
      </div>
      <div className="ju-strip-right">
        {doc.due_date ? (
          <>
            Payment due by
            <b>{formatLong(doc.due_date)}</b>
          </>
        ) : null}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- line items

/**
 * Whether a section shows its own subtotal.
 *
 * An invoice earns them — the client is being asked for money and wants to see
 * where it goes. A quotation does not: three subtotals and a quoted total on
 * one page is four numbers where one will do.
 */
export function sectionSubtotalLabel(doc, section) {
  if (section.subtotal_label) return section.subtotal_label;
  if (section.kind === "coverage") return null;
  if (doc.type === "quotation") return null;
  if ((doc.sections ?? []).length <= 1 && doc.type !== "invoice") return null;
  return "Section subtotal";
}

export function SectionHead({ doc, section, continued }) {
  const number = (doc.sections ?? []).findIndex((s) => s.id === section.id) + 1;
  const showNumber = (doc.sections ?? []).length > 1 && section.kind !== "coverage";
  return (
    <div className="ju-section-head">
      <h3>
        {showNumber ? `${number} · ` : ""}
        {section.title}
        {continued ? " (continued)" : ""}
      </h3>
      {section.meta && !continued ? <span>{section.meta}</span> : null}
    </div>
  );
}

const ITEM_COLUMNS = (
  <colgroup>
    <col />
    <col className="ju-c-qty" />
    <col className="ju-c-unit" />
    <col className="ju-c-amt" />
  </colgroup>
);

export function ItemThead() {
  return (
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit price</th>
        <th>Amount</th>
      </tr>
    </thead>
  );
}

/**
 * `rest` is forwarded to the `<tr>` on purpose: the measuring rig clones these
 * with a marker attribute so it can read each row's height, and a component
 * that swallowed unknown props would report every row as zero-height — which
 * is exactly how a page ends up with more on it than fits.
 */
export function ItemRow({ item, ...rest }) {
  return (
    <tr {...rest}>
      <td>
        {item.description}
        {item.note ? <span className="ju-item-note">{item.note}</span> : null}
      </td>
      <td className="ju-num">{formatQty(item.qty)}</td>
      <td className="ju-num">{item.unit_price_cents == null ? "—" : formatCents(item.unit_price_cents)}</td>
      <td className="ju-num">{formatCents(item.amount_cents ?? 0)}</td>
    </tr>
  );
}

export function SubtotalRow({ label, amount_cents, ...rest }) {
  return (
    <tr className="ju-subtotal" {...rest}>
      <td colSpan={3}>{label}</td>
      <td className="ju-num">{formatCents(amount_cents)}</td>
    </tr>
  );
}

// ----------------------------------------------------------------- totals

export function TotalsBlock({ doc }) {
  const totals = computeTotals(doc);
  const currency = doc.currency ?? "SGD";
  const rows = [];

  if (doc.type === "receipt") {
    rows.push({ label: "Invoice total", value: formatCents(totals.net_total_cents) });
    rows.push({ label: "Total received", value: formatCents(-totals.payments_cents) });
    return <Totals rows={rows} grand={{ label: `Balance outstanding (${currency})`, value: formatMoney(totals.balance_cents, currency) }} />;
  }

  rows.push({ label: "Subtotal", value: formatCents(totals.subtotal_cents) });

  // The GST line is always present. On a document from a business that is not
  // registered it says so, in grey — silence would leave the client wondering
  // whether it was forgotten.
  rows.push(
    totals.gst_registered
      ? { label: `GST ${(doc.gst.rate_bp ?? 0) / 100}%`, value: formatCents(totals.gst_cents) }
      : { label: "GST", value: "Not applicable", muted: true }
  );

  const adjustments = doc.adjustments ?? [];
  if (adjustments.length > 0) {
    rows.push({ label: "Total", value: formatCents(totals.total_cents), rule: true });
    for (const adjustment of adjustments) {
      rows.push({ label: adjustment.label || "Adjustment", value: formatCents(adjustment.amount_cents ?? 0) });
    }
  } else {
    rows[rows.length - 1] = { ...rows[rows.length - 1], rule: false };
  }

  const grandLabel = {
    invoice: `Amount due (${currency})`,
    quotation: `Quoted total (${currency})`,
    credit_note: `Amount credited (${currency})`,
  }[doc.type] ?? `Total (${currency})`;

  const grandValue =
    doc.type === "credit_note"
      ? formatMoney(Math.abs(totals.amount_due_cents), currency)
      : formatMoney(totals.amount_due_cents, currency);

  return <Totals rows={rows} grand={{ label: grandLabel, value: grandValue }} />;
}

function Totals({ rows, grand }) {
  return (
    <div className="ju-totals">
      <table>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.label}-${index}`} className={row.rule ? "ju-rule" : undefined}>
              <td className={row.muted ? "ju-gst-off" : undefined}>{row.label}</td>
              <td className={row.muted ? "ju-num ju-gst-off" : "ju-num"}>{row.value}</td>
            </tr>
          ))}
          <tr className="ju-grand">
            <td>{grand.label}</td>
            <td className="ju-num">{grand.value}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------- panels

const PANEL_TONE = {
  grant_note: "ju-panel ju-panel--tint",
  how_to_pay: "ju-panel ju-panel--warm",
  notes: "ju-panel ju-panel--warm",
  for_your_records: "ju-panel ju-panel--warm",
  inclusions: "ju-panel ju-panel--warm",
  acceptance: "ju-panel",
  correction: "ju-panel ju-panel--warm",
};

export function PanelBlock({ panel, doc, config }) {
  const className = PANEL_TONE[panel.key] ?? "ju-panel";

  return (
    <div className={className}>
      <h4>{panel.heading}</h4>

      {panel.key === "how_to_pay" ? <PaymentDetails doc={doc} config={config} /> : null}

      {panel.paragraphs.map((text, index) => (
        <p key={index}>
          {withEmphasis(text, panel.emphasis).map((part, partIndex) =>
            part.strong ? <b key={partIndex}>{part.text}</b> : <React.Fragment key={partIndex}>{part.text}</React.Fragment>
          )}
        </p>
      ))}

      {panel.signature_labels.length > 0 ? (
        <div className="ju-sign">
          <div className="ju-sign-line" />
          <div className="ju-sign-line" />
          {panel.signature_labels.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
      ) : null}

      {panel.reference_line ? (
        <div className="ju-ref">
          {panel.reference_line.split(doc.number ?? " ").flatMap((chunk, index, all) =>
            index < all.length - 1
              ? [<React.Fragment key={`t${index}`}>{chunk}</React.Fragment>, <b key={`b${index}`}>{doc.number}</b>]
              : [<React.Fragment key={`t${index}`}>{chunk}</React.Fragment>]
          )}
        </div>
      ) : null}

      {panel.stamp ? <span className="ju-stamp">{panel.stamp}</span> : null}
    </div>
  );
}

/**
 * Bold every occurrence of `needle` in `text`.
 *
 * Used for the payment reference, which is the one thing on an invoice a
 * client has to copy accurately for the payment to be traceable.
 */
function boldOccurrences(text, needle) {
  if (!needle) return text;
  const chunks = text.split(needle);
  return chunks.flatMap((chunk, index) =>
    index < chunks.length - 1
      ? [<React.Fragment key={`t${index}`}>{chunk}</React.Fragment>, <b key={`b${index}`}>{needle}</b>]
      : [<React.Fragment key={`t${index}`}>{chunk}</React.Fragment>]
  );
}

/** Bank and PayNow details, with anything unconfirmed shown as unconfirmed. */
function PaymentDetails({ doc, config }) {
  const pay = config?.payment ?? {};
  const confirmed = pay.confirmed;
  const value = (v) =>
    v && confirmed ? <dd>{v}</dd> : <dd className="ju-tbc">To confirm</dd>;

  return (
    <div className="ju-paygrid">
      <dl>
        <dt>Bank</dt>
        {value(pay.bank)}
        <dt>Account name</dt>
        <dd>{pay.account_name}</dd>
        <dt>Account no.</dt>
        {value(pay.account_number)}
        <dt>Swift</dt>
        {value(pay.swift)}
      </dl>
      <dl>
        <dt>PayNow UEN</dt>
        {value(pay.paynow_uen)}
        <dt>Reference</dt>
        <dd>{doc.number ?? "Assigned on issue"}</dd>
        <dt>Currency</dt>
        <dd>{doc.currency ?? "SGD"}</dd>
        <dt>Queries</dt>
        <dd>{pay.queries_email ?? config?.company?.email}</dd>
      </dl>
    </div>
  );
}

// ----------------------------------------------------------------- footer

export function DocFooter({ doc, config, page, pageCount }) {
  const company = doc.company_snapshot ?? config?.company ?? {};
  const legal = [company.legal_name, company.uen, "Singapore", company.email].filter(Boolean).join(" · ");
  const thanks = doc.type === "invoice" && page === pageCount ? config?.footer?.thanks : null;

  return (
    <footer className="ju-foot">
      <div className="ju-legal">
        {doc.specimen ? (
          <>
            <span className="ju-specimen">{config?.specimen_label ?? "Specimen · sample data, illustrative figures"}</span>
            <br />
          </>
        ) : null}
        {legal}
        {thanks ? (
          <>
            <br />
            {thanks}
          </>
        ) : null}
      </div>
      <div className="ju-page-no">
        Page {page} of {pageCount}
      </div>
    </footer>
  );
}
