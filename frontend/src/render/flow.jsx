/**
 * The document as a flat sequence of blocks.
 *
 * The renderer never decides where a page ends; the paginator does, from the
 * measured height of each block in this list. Sections carry their rows
 * separately so a long one can be split across a page boundary rather than
 * being pushed whole onto the next page and leaving half a sheet blank.
 */
import React from "react";

import {
  AmountStrip,
  ItemRow,
  Parties,
  SectionHead,
  SubtotalRow,
  PanelBlock,
  TotalsBlock,
  sectionSubtotalLabel,
} from "./blocks.jsx";
import { computeTotals } from "@jura/shared/document.js";
import { resolvePanels } from "./panels.js";
import { formatCents } from "@jura/shared/money.js";
import { formatShort } from "@jura/shared/dates.js";

/**
 * Build the flow.
 *
 * `simple` blocks are indivisible: an amount strip split across two pages is
 * not an amount strip. `table` blocks carry their rows so the paginator can
 * cut between them.
 */
export function buildFlow(doc, config) {
  const totals = computeTotals(doc);
  const items = [];

  items.push({ key: "parties", kind: "simple", node: <Parties doc={doc} config={config} /> });
  items.push({ key: "strip", kind: "simple", node: <AmountStrip doc={doc} /> });

  // On a receipt, what was paid comes before what it covers.
  if (doc.type === "receipt" && (doc.payments ?? []).length > 0) {
    items.push(paymentsFlowItem(doc, totals));
  }

  for (const section of doc.sections ?? []) {
    const measured = totals.sections.find((s) => s.id === section.id);
    if (!measured || measured.items.length === 0) continue;
    items.push(sectionFlowItem(doc, section, measured));
  }

  items.push({ key: "totals", kind: "simple", node: <TotalsBlock doc={doc} /> });

  for (const panel of resolvePanels(doc, config)) {
    items.push({
      key: `panel-${panel.key}`,
      kind: "simple",
      node: <PanelBlock panel={panel} doc={doc} config={config} />,
    });
  }

  return items;
}

function sectionFlowItem(doc, section, measured) {
  const subtotalLabel = sectionSubtotalLabel(doc, section);
  const rows = measured.items.map((item) => ({
    key: item.id,
    kind: "item",
    node: <ItemRow item={item} />,
  }));

  if (subtotalLabel) {
    rows.push({
      key: `${section.id}-subtotal`,
      kind: "subtotal",
      node: <SubtotalRow label={subtotalLabel} amount_cents={measured.subtotal_cents} />,
    });
  }

  return {
    key: `section-${section.id}`,
    kind: "table",
    head: <SectionHead doc={doc} section={section} />,
    headContinued: <SectionHead doc={doc} section={section} continued />,
    columns: ITEM_COLUMNS,
    thead: ITEM_THEAD,
    rows,
  };
}

function paymentsFlowItem(doc, totals) {
  const rows = (doc.payments ?? []).map((payment) => ({
    key: payment.id,
    kind: "item",
    node: (
      <tr>
        <td>
          {formatShort(payment.date)} · {(payment.method ?? "").toLowerCase()}
          {payment.note ? <span className="ju-item-note">{payment.note}</span> : null}
        </td>
        <td className="ju-num">{payment.reference || "—"}</td>
        <td className="ju-num">{payment.applied_to || "—"}</td>
        <td className="ju-num">{formatCents(payment.amount_cents)}</td>
      </tr>
    ),
  }));

  rows.push({
    key: "payments-total",
    kind: "subtotal",
    node: <SubtotalRow label="Total received" amount_cents={totals.payments_cents} />,
  });

  const head = (continued) => (
    <div className="ju-section-head">
      <h3>Payments applied{continued ? " (continued)" : ""}</h3>
      {doc.source_number && !continued ? <span>Against invoice {doc.source_number}</span> : null}
    </div>
  );

  return {
    key: "payments",
    kind: "table",
    head: head(false),
    headContinued: head(true),
    columns: PAYMENT_COLUMNS,
    thead: PAYMENT_THEAD,
    rows,
  };
}

/* Column widths and header rows are literal elements, not components, so the
   measuring rig can clone them with a marker attribute and read their height. */

const ITEM_COLUMNS = (
  <colgroup>
    <col />
    <col className="ju-c-qty" />
    <col className="ju-c-unit" />
    <col className="ju-c-amt" />
  </colgroup>
);

const ITEM_THEAD = (
  <thead>
    <tr>
      <th>Description</th>
      <th>Qty</th>
      <th>Unit price</th>
      <th>Amount</th>
    </tr>
  </thead>
);

const PAYMENT_THEAD = (
  <thead>
    <tr>
      <th>Date and method</th>
      <th>Reference</th>
      <th>Applied to</th>
      <th>Amount</th>
    </tr>
  </thead>
);

const PAYMENT_COLUMNS = (
  <colgroup>
    <col />
    <col className="ju-c-date" />
    <col className="ju-c-ref" />
    <col className="ju-c-amt" />
  </colgroup>
);

/** One page's slice of a table block. */
export function TableChunk({ item, rows, continued }) {
  return (
    <div className="ju-section">
      {continued ? item.headContinued : item.head}
      <table>
        {item.columns}
        {item.thead}
        <tbody>{rows.map((row) => React.cloneElement(row.node, { key: row.key }))}</tbody>
      </table>
    </div>
  );
}
