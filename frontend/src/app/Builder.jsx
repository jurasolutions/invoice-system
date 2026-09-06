/**
 * The document builder.
 *
 * Three panes, as drawn in the concept: templates on the left, the draft in
 * the middle, the live A4 preview and the actions on the right. Once a
 * document is issued the middle pane goes read-only and the right-hand pane
 * becomes what happened next — payments, a receipt, a credit note.
 */
import React from "react";

import { Alert, Badge, Button, Field, Icon, Input, Select, Textarea } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { useDocument } from "./useDocument.js";
import { href } from "./router.js";
import { SectionEditor } from "./SectionEditor.jsx";
import { DocumentActions } from "./DocumentActions.jsx";
import { PaymentsPanel } from "./PaymentsPanel.jsx";
import { AdjustmentsEditor } from "./AdjustmentsEditor.jsx";
import { PreviewPane } from "./PreviewPane.jsx";
import { computeTotals, isIssued, snapshotClient, validateForIssue } from "@jura/shared/document.js";
import { TYPE_LABEL } from "@jura/shared/numbering.js";
import { addDays, isISODate } from "@jura/shared/dates.js";
import { formatMoney } from "@jura/shared/money.js";

export function Builder({ id }) {
  const { data, toast, reload } = useApp();
  const { doc, update, reload: reloadDoc, flush, saveState, loadError } = useDocument(id, {
    onError: (error) => toast(error.message, "danger"),
  });

  if (loadError) {
    return (
      <div className="container--narrow">
        <Alert tone="danger" title="Cannot open this document">
          {loadError.message} <a href={href.dashboard()}>Back to documents</a>
        </Alert>
      </div>
    );
  }

  if (!doc) return <div className="container muted">Loading…</div>;

  const readOnly = isIssued(doc);
  const totals = computeTotals(doc);
  const problems = readOnly ? [] : validateForIssue(doc, data.config);

  return (
    <>
      <div className="page-head" style={{ maxWidth: 1600 }}>
        <div>
          <h1>
            {TYPE_LABEL[doc.type]} {doc.number ? <span className="mono">{doc.number}</span> : <span className="muted">draft</span>}
          </h1>
          <p>
            {doc.client_snapshot?.name || "No client selected"} · {formatMoney(totals.amount_due_cents, doc.currency)}
            {doc.specimen ? (
              <Badge tone="warning" mono style={{ marginLeft: "var(--space-3)" }}>
                Specimen
              </Badge>
            ) : null}
          </p>
        </div>
        <span className="spacer" />
        <SaveState state={saveState} readOnly={readOnly} />
        <Button variant="secondary" size="sm" href={href.dashboard()} iconLeft={<Icon name="ArrowLeft" size={16} />}>
          All documents
        </Button>
      </div>

      <div className="builder">
        <div className="pane pane--sunken">
          <TemplateRail doc={doc} update={update} readOnly={readOnly} />
        </div>

        <div className="pane">
          <h2>{readOnly ? "Issued — content locked" : "Draft"}</h2>

          {readOnly ? (
            <Alert tone="info" title={`${doc.number} has been issued`} style={{ marginBottom: "var(--space-4)" }}>
              Its content is fixed, because it is the record of what the client received. Corrections go on a credit
              note.
            </Alert>
          ) : null}

          <HeaderFields doc={doc} update={update} readOnly={readOnly} clients={data.clients} config={data.config} />

          <div style={{ marginTop: "var(--space-5)" }}>
            <h2>Sections and items</h2>
            <SectionEditor doc={doc} update={update} readOnly={readOnly} />
          </div>

          <div style={{ marginTop: "var(--space-5)" }}>
            <h2>Adjustments</h2>
            <AdjustmentsEditor doc={doc} update={update} readOnly={readOnly} />
          </div>

          {doc.type === "invoice" ? (
            <div style={{ marginTop: "var(--space-5)" }}>
              <h2>Payments received</h2>
              <PaymentsPanel doc={doc} onChanged={reloadDoc} />
            </div>
          ) : null}

          <div style={{ marginTop: "var(--space-5)" }}>
            <h2>Notes printed on the document</h2>
            <Textarea
              aria-label="Notes"
              rows={3}
              placeholder="Optional. Replaces the default notes panel."
              value={doc.notes ?? ""}
              readOnly={readOnly}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </div>
        </div>

        <div className="pane pane--preview pane--sticky">
          <PreviewPane doc={doc} config={data.config} />
          <DocumentActions
            doc={doc}
            problems={problems}
            onBeforeAction={flush}
            onChanged={async () => {
              await reloadDoc();
              await reload();
            }}
          />
        </div>
      </div>
    </>
  );
}

function SaveState({ state, readOnly }) {
  if (readOnly) {
    return (
      <span className="muted row" style={{ gap: "var(--space-2)" }}>
        <Icon name="Lock" size={14} /> locked
      </span>
    );
  }
  const label = { idle: "", saving: "Saving…", saved: "Saved", error: "Not saved" }[state] ?? "";
  if (!label) return null;
  return (
    <span className="muted row" style={{ gap: "var(--space-2)" }}>
      <span className={state === "error" ? "dot dot--void" : state === "saving" ? "dot dot--draft" : "dot"} />
      {label}
    </span>
  );
}

/** Client, reference and the dates. */
function HeaderFields({ doc, update, readOnly, clients, config }) {
  const { run } = useApp();
  const [adding, setAdding] = React.useState(false);

  const pickClient = (clientId) => {
    if (clientId === "__new") {
      setAdding(true);
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    update({ client_id: client?.id ?? null, client_snapshot: snapshotClient(client) });
  };

  const setIssuedAt = (value) => {
    if (!isISODate(value)) {
      update({ issued_at: value });
      return;
    }
    const change = { issued_at: value };
    if (doc.type === "invoice" && doc.terms_days != null) change.due_date = addDays(value, doc.terms_days);
    if (doc.type === "quotation") {
      change.valid_until = addDays(value, config?.terms?.quotation_validity_days ?? 30);
    }
    update(change);
  };

  return (
    <>
      <div className="field-grid">
        <Field label="Client">
          <Select
            value={doc.client_id ?? ""}
            disabled={readOnly}
            placeholder="Select a client"
            onChange={(event) => pickClient(event.target.value)}
            options={[
              ...clients.map((client) => ({ value: client.id, label: client.name })),
              { value: "__new", label: "Add a client…" },
            ]}
          />
        </Field>

        <Field label="Your reference" hint="Their PO number, if they use one">
          <Input
            value={doc.reference ?? ""}
            readOnly={readOnly}
            placeholder="PO-4417"
            onChange={(event) => update({ reference: event.target.value })}
          />
        </Field>

        <Field label={doc.type === "receipt" ? "Receipt date" : "Issue date"}>
          <Input type="date" value={doc.issued_at ?? ""} readOnly={readOnly} onChange={(event) => setIssuedAt(event.target.value)} />
        </Field>

        {doc.type === "invoice" ? (
          <Field label="Terms" hint={doc.due_date ? `Due ${doc.due_date}` : undefined}>
            <Select
              value={String(doc.terms_days ?? 30)}
              disabled={readOnly}
              placeholder=""
              onChange={(event) => {
                const days = Number(event.target.value);
                update({ terms_days: days, due_date: addDays(doc.issued_at, days) });
              }}
              options={[
                { value: "0", label: "Due on receipt" },
                { value: "7", label: "Net 7" },
                { value: "14", label: "Net 14" },
                { value: "30", label: "Net 30" },
                { value: "60", label: "Net 60" },
              ]}
            />
          </Field>
        ) : null}

        {doc.type === "quotation" ? (
          <Field label="Valid until">
            <Input
              type="date"
              value={doc.valid_until ?? ""}
              readOnly={readOnly}
              onChange={(event) => update({ valid_until: event.target.value })}
            />
          </Field>
        ) : null}

        {doc.type === "quotation" ? (
          <Field label="Prepared by">
            <Input
              value={doc.prepared_by ?? ""}
              readOnly={readOnly}
              onChange={(event) => update({ prepared_by: event.target.value })}
            />
          </Field>
        ) : null}
      </div>

      {adding ? (
        <NewClientForm
          onCancel={() => setAdding(false)}
          onSave={async (client) => {
            const saved = await run(() => api.saveClient(client), { success: "Client added." });
            if (saved) {
              update({ client_id: saved.id, client_snapshot: snapshotClient(saved) });
              setAdding(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function NewClientForm({ onSave, onCancel }) {
  const [form, setForm] = React.useState({ name: "", attention: "", address: "", email: "", uen: "" });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="pane pane--sunken" style={{ marginTop: "var(--space-4)" }}>
      <h3>New client</h3>
      <div className="field-grid">
        <Field label="Name" required>
          <Input value={form.name} onChange={set("name")} placeholder="Northbridge Dental Group Pte. Ltd." />
        </Field>
        <Field label="Attention" hint="Who signs it off">
          <Input value={form.attention} onChange={set("attention")} placeholder="Rachel Ong, operations manager" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="UEN" hint="Optional">
          <Input value={form.uen} onChange={set("uen")} />
        </Field>
      </div>
      <Field label="Address" hint="One line per line">
        <Textarea rows={3} value={form.address} onChange={set("address")} />
      </Field>
      <div className="row" style={{ marginTop: "var(--space-3)" }}>
        <Button
          size="sm"
          disabled={!form.name.trim()}
          onClick={() =>
            onSave({
              id: `cli_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
              name: form.name.trim(),
              attention: form.attention.trim(),
              address_lines: form.address.split("\n").map((line) => line.trim()).filter(Boolean),
              email: form.email.trim(),
              uen: form.uen.trim(),
            })
          }
        >
          Save client
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The template rail.
 *
 * Applying a template replaces the draft's sections. It never writes back to
 * the template — that only happens through "save as template", deliberately,
 * so a one-off discount on one job cannot quietly become the default.
 */
function TemplateRail({ doc, update, readOnly }) {
  const { data, toast } = useApp();

  const apply = (template) => {
    if (readOnly) return;
    const confirmed =
      doc.sections.every((section) => !section.title && section.items.every((item) => !item.description)) ||
      window.confirm(`Replace the sections in this draft with "${template.name}"?`);
    if (!confirmed) return;

    update((current) => ({
      ...current,
      // Fresh ids on everything, so nothing is shared with the template file.
      sections: (template.sections ?? []).map((section, sectionIndex) => ({
        id: `sec_${Date.now().toString(36)}${sectionIndex}`,
        title: section.title ?? "",
        meta: section.meta ?? "",
        items: (section.items ?? []).map((item, itemIndex) => ({
          id: `itm_${Date.now().toString(36)}${sectionIndex}${itemIndex}`,
          description: item.description ?? "",
          note: item.note ?? "",
          qty: item.qty ?? 1,
          unit_price_cents: item.unit_price_cents ?? null,
        })),
      })),
      template_slug: template.slug,
    }));
    toast(`Applied "${template.name}".`);
  };

  return (
    <>
      <h2>Templates</h2>
      {data.templates.map((template) => (
        <button
          key={template.slug}
          type="button"
          className="tpl"
          aria-pressed={doc.template_slug === template.slug}
          disabled={readOnly}
          onClick={() => apply(template)}
        >
          <b>{template.name}</b>
          <span>{template.description}</span>
        </button>
      ))}

      <h2 style={{ marginTop: "var(--space-5)" }}>Applying a template</h2>
      <p className="muted" style={{ fontSize: "var(--text-caption)", lineHeight: "var(--leading-relaxed)" }}>
        A template carries sections, items and default rates. Applying one fills the draft. Everything stays editable
        afterwards, and edits never write back to the template unless you choose save as template.
      </p>
      <p className="muted" style={{ fontSize: "var(--text-caption)", marginTop: "var(--space-3)" }}>
        The templates that ship carry structure but no rates. Fill yours in once and save the template back.
      </p>
    </>
  );
}
