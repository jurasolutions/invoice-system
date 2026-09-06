/**
 * Payments recorded against an invoice.
 *
 * Payments are one of the few things allowed to change after issue. The
 * invoice's content is the record of what the client was asked for; what they
 * have since paid against it is not part of that content.
 *
 * A deposit taken before the invoice went out is the awkward case. It belongs
 * on the face of the invoice as a "less deposit paid" line *and* in this list,
 * because the receipt has to account for it. Recording it here as a pre-issue
 * deposit writes both, linked, so it is only ever counted once.
 */
import React from "react";

import { Alert, Button, Field, Icon, IconButton, Input, Select } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { computeTotals, isIssued } from "@jura/shared/document.js";
import { formatCents, formatMoney, parseMoneyToCents } from "@jura/shared/money.js";
import { formatShort, today } from "@jura/shared/dates.js";

const METHODS = ["Bank transfer", "PayNow", "Cheque", "Card", "Cash", "Other"];

export function PaymentsPanel({ doc, onChanged }) {
  const { run } = useApp();
  const [adding, setAdding] = React.useState(false);
  const totals = computeTotals(doc);
  const issued = isIssued(doc);
  const payments = doc.payments ?? [];

  if (!issued) {
    return (
      <Alert tone="info">
        Payments are recorded once the invoice has been issued. A deposit taken before then goes on as an adjustment,
        and can be linked to a payment record when you record it.
      </Alert>
    );
  }

  return (
    <>
      {payments.length === 0 ? (
        <p className="muted">Nothing received yet. Outstanding {formatMoney(totals.balance_cents, doc.currency)}.</p>
      ) : (
        <table className="doc-table" style={{ marginBottom: "var(--space-3)" }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Applied to</th>
              <th className="right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="num">{formatShort(payment.date)}</td>
                <td>{payment.method}</td>
                <td className="num">{payment.reference || "—"}</td>
                <td>{payment.applied_to}</td>
                <td className="right num">{formatCents(payment.amount_cents)}</td>
                <td className="right">
                  <IconButton
                    label="Remove payment"
                    size="sm"
                    variant="ghost"
                    icon={<Icon name="X" size={16} />}
                    onClick={async () => {
                      if (!window.confirm("Remove this payment record?")) return;
                      await run(() => api.removePayment(doc.id, payment.id), { success: "Payment removed." });
                      onChanged?.();
                    }}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="muted">
                Balance outstanding
              </td>
              <td className="right num">
                <strong>{formatMoney(totals.balance_cents, doc.currency)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {adding ? (
        <PaymentForm
          doc={doc}
          suggested={totals.balance_cents}
          onCancel={() => setAdding(false)}
          onSave={async (payment) => {
            const saved = await run(() => api.addPayment(doc.id, payment), { success: "Payment recorded." });
            if (saved) {
              setAdding(false);
              onChanged?.();
            }
          }}
        />
      ) : (
        <Button size="sm" variant="secondary" iconLeft={<Icon name="Wallet" size={16} />} onClick={() => setAdding(true)}>
          Record a payment
        </Button>
      )}
    </>
  );
}

function PaymentForm({ doc, suggested, onSave, onCancel }) {
  const [form, setForm] = React.useState({
    date: today(),
    method: "Bank transfer",
    reference: doc.number ?? "",
    applied_to: suggested === computeTotals(doc).net_total_cents ? "Deposit" : "Balance",
    amount: suggested > 0 ? (suggested / 100).toFixed(2) : "",
  });

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const cents = parseMoneyToCents(form.amount);

  return (
    <div className="pane pane--sunken">
      <div className="field-grid">
        <Field label="Date received">
          <Input type="date" value={form.date} onChange={set("date")} />
        </Field>
        <Field label="Method">
          <Select value={form.method} onChange={set("method")} placeholder="" options={METHODS} />
        </Field>
        <Field label="Reference" hint="What appears on the statement">
          <Input value={form.reference} onChange={set("reference")} />
        </Field>
        <Field label="Applied to">
          <Select
            value={form.applied_to}
            onChange={set("applied_to")}
            placeholder=""
            options={["Deposit", "Part payment", "Balance"]}
          />
        </Field>
        <Field label="Amount" error={form.amount && cents === null ? "Not a number" : undefined}>
          <Input inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0.00" />
        </Field>
      </div>
      <div className="row" style={{ marginTop: "var(--space-3)" }}>
        <Button size="sm" disabled={!cents} onClick={() => onSave({ ...form, amount_cents: cents })}>
          Record it
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
