/**
 * Every document, newest first.
 *
 * The columns are the ones you look for when someone asks "did they pay?" —
 * the number, who it is for, what it is worth and what is still outstanding.
 */
import React from "react";

import { Badge, Button, Icon, Select } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { href, navigate } from "./router.js";
import { formatMoney } from "../domain/money.js";
import { formatShort } from "../domain/dates.js";
import { TYPE_LABEL } from "../domain/numbering.js";

const STATUS_TONE = {
  draft: "neutral",
  issued: "info",
  sent: "info",
  accepted: "success",
  paid: "success",
  expired: "warning",
  void: "danger",
};

export function Dashboard() {
  const { data, run } = useApp();
  const [type, setType] = React.useState("all");
  const [status, setStatus] = React.useState("open");

  const documents = data.documents.filter((doc) => {
    if (type !== "all" && doc.type !== type) return false;
    if (status === "open") return doc.status !== "paid" && doc.status !== "void" && doc.status !== "expired";
    if (status === "all") return true;
    return doc.status === status;
  });

  const create = (documentType) =>
    run(
      async () => {
        const doc = await api.createDocument({ type: documentType });
        navigate(href.document(doc.id));
        return doc;
      },
      { refresh: true }
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>
            Quotations, invoices and receipts. Numbers are assigned when a document is issued, never while it is a
            draft.
          </p>
        </div>
        <span className="spacer" />
        <div className="row">
          <Button variant="secondary" size="sm" onClick={() => create("quotation")} iconLeft={<Icon name="Plus" size={16} />}>
            Quotation
          </Button>
          <Button size="sm" onClick={() => create("invoice")} iconLeft={<Icon name="Plus" size={16} />}>
            Invoice
          </Button>
        </div>
      </div>

      <div className="container stack">
        <div className="row row--wrap">
          <Select
            aria-label="Document type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder=""
            options={[
              { value: "all", label: "All types" },
              { value: "quotation", label: "Quotations" },
              { value: "invoice", label: "Invoices" },
              { value: "receipt", label: "Receipts" },
              { value: "credit_note", label: "Credit notes" },
            ]}
            style={{ maxWidth: 180 }}
          />
          <Select
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            placeholder=""
            options={[
              { value: "open", label: "Open" },
              { value: "all", label: "All statuses" },
              { value: "draft", label: "Drafts" },
              { value: "issued", label: "Issued" },
              { value: "sent", label: "Sent" },
              { value: "accepted", label: "Accepted" },
              { value: "paid", label: "Paid" },
              { value: "void", label: "Void" },
            ]}
            style={{ maxWidth: 180 }}
          />
          <span className="muted">
            {documents.length} of {data.documents.length}
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="empty">
            <p>Nothing here yet.</p>
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              Start a quotation or an invoice above. Or run <code>npm run seed -- --with-specimen</code> for the three
              specimen documents from the concept design.
            </p>
          </div>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Client</th>
                <th>Date</th>
                <th>Status</th>
                <th className="right">Total</th>
                <th className="right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <a href={href.document(doc.id)} className="mono">
                      {doc.number ?? "Draft"}
                    </a>
                    {doc.specimen ? (
                      <Badge tone="warning" mono style={{ marginLeft: "var(--space-2)" }}>
                        Specimen
                      </Badge>
                    ) : null}
                  </td>
                  <td>{TYPE_LABEL[doc.type]}</td>
                  <td>{doc.client_name || <span className="muted">No client</span>}</td>
                  <td className="num">{formatShort(doc.issued_at)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[doc.status] ?? "neutral"} dot>
                      {doc.status}
                    </Badge>
                  </td>
                  <td className="right num">{formatMoney(doc.net_total_cents, doc.currency)}</td>
                  <td className="right num">
                    {doc.type === "invoice" ? (
                      doc.balance_cents === 0 ? (
                        <span className="muted">Settled</span>
                      ) : (
                        formatMoney(doc.balance_cents, doc.currency)
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
