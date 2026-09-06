/**
 * What you can do with a document, and what stops you.
 *
 * Issuing is the one irreversible step: it takes a number out of the sequence
 * and freezes the content. So the reasons it is not ready are listed before
 * the button rather than appearing as an error after it, and the confirm says
 * plainly what is about to happen.
 */
import React from "react";

import { Alert, Badge, Button, Dialog, Icon, Input } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { href, navigate } from "./router.js";
import { computeTotals, isIssued, canTransition } from "../domain/document.js";
import { TYPE_LABEL } from "../domain/numbering.js";
import { formatMoney } from "../domain/money.js";

export function DocumentActions({ doc, problems, onChanged, onBeforeAction }) {
  const { run, data } = useApp();
  const [confirmIssue, setConfirmIssue] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [savingTemplate, setSavingTemplate] = React.useState(false);

  const issued = isIssued(doc);
  const totals = computeTotals(doc);
  const ready = problems.length === 0;

  const act = async (work, success) => {
    await onBeforeAction?.();
    return run(work, { success });
  };

  return (
    <div className="actions">
      {!issued && problems.length > 0 ? (
        <Alert tone="warning" title={`Not ready to issue`}>
          <ul className="problem-list">
            {problems.slice(0, 6).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {!issued ? (
        <>
          <Button
            fullWidth
            disabled={!ready}
            onClick={() => setConfirmIssue(true)}
            iconLeft={<Icon name="FileCheck2" size={18} />}
          >
            Issue and lock
          </Button>
          <Button
            fullWidth
            variant="secondary"
            href={href.print(doc.id)}
            target="_blank"
            rel="noreferrer"
            iconLeft={<Icon name="Printer" size={18} />}
          >
            Open print view
          </Button>
        </>
      ) : (
        <>
          <Button
            fullWidth
            href={href.print(doc.id)}
            target="_blank"
            rel="noreferrer"
            iconLeft={<Icon name="Printer" size={18} />}
          >
            Print or save as PDF
          </Button>

          {canTransition(doc, "sent") ? (
            <Button fullWidth variant="secondary" onClick={() => act(() => api.setStatus(doc.id, "sent"), "Marked sent.").then(onChanged)}>
              Mark as sent
            </Button>
          ) : null}

          {doc.type === "quotation" && canTransition(doc, "accepted") ? (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => act(() => api.setStatus(doc.id, "accepted"), "Marked accepted.").then(onChanged)}
            >
              Mark as accepted
            </Button>
          ) : null}

          {doc.type === "quotation" && !doc.links?.invoice_id ? (
            <Button
              fullWidth
              variant="secondary"
              iconLeft={<Icon name="ArrowRight" size={18} />}
              onClick={async () => {
                const invoice = await act(() => api.convert(doc.id), "Invoice drafted from this quotation.");
                if (invoice) navigate(href.document(invoice.id));
              }}
            >
              Convert to invoice
            </Button>
          ) : null}

          {doc.type === "invoice" && (doc.payments ?? []).length > 0 ? (
            <Button
              fullWidth
              variant="secondary"
              iconLeft={<Icon name="Receipt" size={18} />}
              onClick={async () => {
                const receipt = await act(() => api.makeReceipt(doc.id), "Receipt drafted from the recorded payments.");
                if (receipt) navigate(href.document(receipt.id));
              }}
            >
              Draft a receipt
            </Button>
          ) : null}

          {doc.type === "invoice" && doc.status !== "void" ? (
            <Button
              fullWidth
              variant="ghost"
              iconLeft={<Icon name="RotateCcw" size={18} />}
              onClick={async () => {
                const reason = window.prompt("What is being corrected? This goes on the credit note.");
                if (reason === null) return;
                const note = await act(() => api.creditNote(doc.id, reason), "Credit note drafted.");
                if (note) navigate(href.document(note.id));
              }}
            >
              Raise a credit note
            </Button>
          ) : null}
        </>
      )}

      <Button
        fullWidth
        variant="secondary"
        iconLeft={<Icon name="Copy" size={18} />}
        onClick={async () => {
          const copy = await act(
            () =>
              api.createDocument({
                type: doc.type,
                client_id: doc.client_id,
                from: {
                  client_id: doc.client_id,
                  client_snapshot: doc.client_snapshot,
                  reference: doc.reference,
                  currency: doc.currency,
                  terms_days: doc.terms_days,
                  sections: doc.sections,
                  adjustments: (doc.adjustments ?? []).filter((a) => !a.payment_id),
                  panels: doc.panels,
                  notes: doc.notes,
                  specimen: doc.specimen,
                },
              }),
            "Duplicated as a new draft."
          );
          if (copy) navigate(href.document(copy.id));
        }}
      >
        Duplicate
      </Button>

      {!issued ? (
        savingTemplate ? (
          <div className="row" style={{ gap: "var(--space-2)" }}>
            <Input
              autoFocus
              aria-label="Template name"
              placeholder="Template name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <Button
              size="sm"
              disabled={!templateName.trim()}
              onClick={async () => {
                const saved = await act(
                  () =>
                    api.saveTemplate({
                      name: templateName.trim(),
                      description: `Saved from ${doc.number ?? "a draft"}.`,
                      document_type: doc.type,
                      terms_days: doc.terms_days,
                      panels: doc.panels,
                      // Structure and rates only. Client, dates, reference and
                      // anything payment-linked stay with the document.
                      sections: doc.sections.map((section) => ({
                        title: section.title,
                        meta: "",
                        items: section.items.map((item) => ({
                          description: item.description,
                          note: item.note ?? "",
                          qty: item.qty,
                          unit_price_cents: item.unit_price_cents,
                        })),
                      })),
                    }),
                  "Saved as a template."
                );
                if (saved) {
                  setSavingTemplate(false);
                  setTemplateName("");
                  onChanged?.();
                }
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button fullWidth variant="ghost" onClick={() => setSavingTemplate(true)}>
            Save as template
          </Button>
        )
      ) : null}

      {!issued ? (
        <Button
          fullWidth
          variant="ghost"
          iconLeft={<Icon name="Trash2" size={18} />}
          onClick={async () => {
            if (!window.confirm("Delete this draft? It has no number, so nothing is left behind.")) return;
            const done = await act(() => api.deleteDocument(doc.id), "Draft deleted.");
            if (done) navigate(href.dashboard());
          }}
        >
          Delete draft
        </Button>
      ) : doc.status !== "void" ? (
        <Button
          fullWidth
          variant="ghost"
          onClick={async () => {
            const reason = window.prompt(
              `Void ${doc.number}? The number stays in the sequence and is never reused. Why is it being voided?`
            );
            if (reason === null) return;
            await act(() => api.setStatus(doc.id, "void", reason), `${doc.number} voided.`);
            onChanged?.();
          }}
        >
          Void this document
        </Button>
      ) : null}

      <div style={{ marginTop: "var(--space-3)" }}>
        <h3>{issued ? "After issue" : "On issue"}</h3>
        <p className="muted" style={{ fontSize: "var(--text-caption)", lineHeight: "var(--leading-relaxed)" }}>
          {issued
            ? "The number is locked and the content is fixed. It can still be marked sent or paid, and a receipt or credit note can be raised against it."
            : "Issuing takes the next number in this month's sequence and freezes the content. A draft that is deleted instead leaves no gap, because it never took a number."}
        </p>
        {issued ? (
          <dl className="definition-list" style={{ marginTop: "var(--space-3)" }}>
            <dt>Status</dt>
            <dd>{doc.status}</dd>
            {doc.type === "invoice" ? (
              <>
                <dt>Balance</dt>
                <dd>{formatMoney(totals.balance_cents, doc.currency)}</dd>
              </>
            ) : null}
            {doc.links?.invoice_id && doc.type !== "invoice" ? (
              <>
                <dt>Invoice</dt>
                <dd>
                  <a href={href.document(doc.links.invoice_id)}>open</a>
                </dd>
              </>
            ) : null}
            {(doc.links?.receipt_ids ?? []).length > 0 ? (
              <>
                <dt>Receipts</dt>
                <dd>
                  {doc.links.receipt_ids.map((receiptId) => (
                    <a key={receiptId} href={href.document(receiptId)} style={{ marginRight: "var(--space-2)" }}>
                      open
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>

      <Dialog
        open={confirmIssue}
        title={`Issue this ${TYPE_LABEL[doc.type].toLowerCase()}?`}
        description="This takes the next number in the sequence and locks the content. Numbers are never reused, so a document issued by mistake has to be voided rather than deleted."
        onClose={() => setConfirmIssue(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmIssue(false)}>
              Not yet
            </Button>
            <Button
              onClick={async () => {
                setConfirmIssue(false);
                const result = await act(() => api.issue(doc.id), null);
                if (result) {
                  onChanged?.();
                }
              }}
            >
              Issue it
            </Button>
          </>
        }
      >
        <dl className="definition-list">
          <dt>Client</dt>
          <dd>{doc.client_snapshot?.name}</dd>
          <dt>{doc.type === "receipt" ? "Received" : "Amount"}</dt>
          <dd>{formatMoney(doc.type === "receipt" ? totals.payments_cents : totals.amount_due_cents, doc.currency)}</dd>
          <dt>Issue date</dt>
          <dd>{doc.issued_at}</dd>
        </dl>
        {doc.specimen ? (
          <p style={{ marginTop: "var(--space-4)" }}>
            <Badge tone="warning" mono>
              Specimen
            </Badge>{" "}
            This document is flagged as a specimen and will print the sample-data chip in its footer.
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
