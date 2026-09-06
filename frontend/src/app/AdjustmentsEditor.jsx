/**
 * Adjustments: the lines between the total and the amount due.
 *
 * Two kinds, and the difference matters to the arithmetic.
 *
 *   A discount reduces what the client owes altogether.
 *   A deposit already paid reduces only what this invoice asks for now — the
 *   client still owed the full amount, they just paid part of it earlier.
 *
 * A deposit line is linked to its payment record, so the receipt can list the
 * deposit as money received without the balance being reduced twice. See
 * computeTotals() in src/domain/document.js.
 */
import React from "react";

import { Alert, Button, Icon, IconButton, Input } from "../ds.js";
import { blankAdjustment, computeTotals } from "@jura/shared/document.js";
import { centsToInput, formatMoney, parseMoneyToCents } from "@jura/shared/money.js";

export function AdjustmentsEditor({ doc, update, readOnly }) {
  const adjustments = doc.adjustments ?? [];
  const totals = computeTotals(doc);

  const setAdjustments = (next) => update((current) => ({ ...current, adjustments: next }));

  const patch = (id, change) =>
    setAdjustments(adjustments.map((adjustment) => (adjustment.id === id ? { ...adjustment, ...change } : adjustment)));

  if (adjustments.length === 0 && readOnly) {
    return <p className="muted">None.</p>;
  }

  return (
    <>
      {adjustments.map((adjustment) => (
        <div className="row" key={adjustment.id} style={{ marginBottom: "var(--space-2)" }}>
          <Input
            aria-label="Adjustment label"
            placeholder="Less deposit paid 18 Aug 2026"
            value={adjustment.label}
            readOnly={readOnly}
            onChange={(event) => patch(adjustment.id, { label: event.target.value })}
          />
          <Input
            aria-label="Adjustment amount"
            inputMode="decimal"
            placeholder="-3000.00"
            defaultValue={centsToInput(adjustment.amount_cents)}
            readOnly={readOnly}
            onChange={(event) => patch(adjustment.id, { amount_cents: parseMoneyToCents(event.target.value) ?? 0 })}
            style={{ maxWidth: 140 }}
          />
          {adjustment.payment_id ? (
            <span className="muted" title="Linked to a payment record, so it is not counted against the balance twice">
              deposit
            </span>
          ) : null}
          {readOnly ? null : (
            <IconButton
              label="Remove adjustment"
              size="sm"
              variant="ghost"
              icon={<Icon name="X" size={16} />}
              onClick={() => setAdjustments(adjustments.filter((a) => a.id !== adjustment.id))}
            />
          )}
        </div>
      ))}

      {readOnly ? null : (
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Icon name="Plus" size={16} />}
            onClick={() => setAdjustments([...adjustments, blankAdjustment()])}
          >
            Add an adjustment
          </Button>
          <span className="muted num">
            Amount due {formatMoney(totals.amount_due_cents, doc.currency)}
          </span>
        </div>
      )}

      {totals.deposit_adjustments_cents !== 0 ? (
        <Alert tone="info" style={{ marginTop: "var(--space-3)" }}>
          A deposit line is linked to a payment record, so the receipt lists it as money received without taking it
          off the balance a second time.
        </Alert>
      ) : null}
    </>
  );
}
