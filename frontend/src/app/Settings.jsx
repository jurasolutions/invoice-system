/**
 * Settings — the contents of `config.json`, edited in place.
 *
 * Three things here are load-bearing rather than cosmetic:
 *
 *   The `_confirmed` flags. A placeholder UEN prints in grey and blocks
 *   issuing. Ticking a flag is you saying the value beside it is the real one.
 *
 *   The GST switch. Jura is not registered, so documents say "Invoice" and
 *   carry a line stating no GST is charged. Only a GST-registered business may
 *   head a document "Tax invoice" — registering later is this switch plus a
 *   number, not a rebuild.
 *
 *   The grant note's checked-on date. EDG, PSG and MRA are being consolidated
 *   into EDGE through the second half of 2026, so the wording will go stale.
 *   The app nags past 180 days.
 */
import React from "react";

import { Alert, Badge, Button, Checkbox, Field, Icon, Input, Textarea } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { grantNoteAge } from "@jura/shared/document.js";
import { today } from "@jura/shared/dates.js";

export function Settings() {
  const { data, run } = useApp();
  const [config, setConfig] = React.useState(data.config);
  const [dirty, setDirty] = React.useState(false);

  const patch = (path, value) => {
    setConfig((current) => {
      const next = structuredClone(current);
      let cursor = next;
      const keys = path.split(".");
      for (const key of keys.slice(0, -1)) cursor = cursor[key];
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  };

  const grant = grantNoteAge(config);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            These are the contents of <code>config.json</code>. They print on every document, so a placeholder here is
            a placeholder on a client's invoice.
          </p>
        </div>
        <span className="spacer" />
        <Button
          size="sm"
          disabled={!dirty}
          onClick={async () => {
            const saved = await run(() => api.writeConfig(config), { success: "Settings saved." });
            if (saved) setDirty(false);
          }}
        >
          Save settings
        </Button>
      </div>

      <div className="container--narrow stack">
        <section className="pane">
          <h2>Company</h2>
          <div className="field-grid">
            <Field label="Registered name" hint="Exactly as filed">
              <Input value={config.company.legal_name} onChange={(e) => patch("company.legal_name", e.target.value)} />
            </Field>
            <Field label="UEN">
              <Input value={config.company.uen} onChange={(e) => patch("company.uen", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={config.company.email} onChange={(e) => patch("company.email", e.target.value)} />
            </Field>
            <Field label="Website">
              <Input value={config.company.website} onChange={(e) => patch("company.website", e.target.value)} />
            </Field>
            <Field label="Prepared by" hint="Printed on quotations">
              <Input value={config.company.prepared_by ?? ""} onChange={(e) => patch("company.prepared_by", e.target.value)} />
            </Field>
          </div>

          <Field label="Registered address" hint="One line per line">
            <Textarea
              rows={3}
              value={config.company.address_lines.join("\n")}
              onChange={(e) => patch("company.address_lines", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
            />
          </Field>

          <div className="stack" style={{ marginTop: "var(--space-4)" }}>
            <Checkbox
              label="The UEN above is the real one — until this is ticked it prints in grey and documents cannot be issued"
              checked={config.company.uen_confirmed}
              onChange={(e) => patch("company.uen_confirmed", e.target.checked)}
            />
            <Checkbox
              label="The address above is the real one"
              checked={config.company.address_confirmed}
              onChange={(e) => patch("company.address_confirmed", e.target.checked)}
            />
          </div>
        </section>

        <section className="pane">
          <h2>GST</h2>
          {config.gst.registered ? (
            <Alert tone="warning" title="Documents will be headed &quot;Tax invoice&quot;">
              Only switch this on once Jura is actually GST-registered. Heading a document "Tax invoice" without a
              registration is an offence under the IRAS rules, not a formatting choice.
            </Alert>
          ) : (
            <Alert tone="info">
              Jura is not GST-registered, so documents are headed "Invoice" and carry a line saying no GST is charged.
              The GST fields are fully wired behind this switch — registering later is this checkbox plus a number.
            </Alert>
          )}
          <div className="stack" style={{ marginTop: "var(--space-4)" }}>
            <Checkbox
              label="Jura is registered for GST"
              checked={config.gst.registered}
              onChange={(e) => patch("gst.registered", e.target.checked)}
            />
            <div className="field-grid">
              <Field label="GST registration number">
                <Input
                  value={config.gst.number ?? ""}
                  disabled={!config.gst.registered}
                  onChange={(e) => patch("gst.number", e.target.value || null)}
                />
              </Field>
              <Field label="Rate" hint="In basis points — 900 is 9%">
                <Input
                  inputMode="numeric"
                  value={String(config.gst.rate_bp)}
                  disabled={!config.gst.registered}
                  onChange={(e) => patch("gst.rate_bp", Number(e.target.value) || 0)}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="pane">
          <h2>How to pay</h2>
          <div className="field-grid">
            <Field label="Bank">
              <Input value={config.payment.bank ?? ""} onChange={(e) => patch("payment.bank", e.target.value || null)} />
            </Field>
            <Field label="Account name">
              <Input value={config.payment.account_name ?? ""} onChange={(e) => patch("payment.account_name", e.target.value)} />
            </Field>
            <Field label="Account number">
              <Input value={config.payment.account_number ?? ""} onChange={(e) => patch("payment.account_number", e.target.value || null)} />
            </Field>
            <Field label="SWIFT">
              <Input value={config.payment.swift ?? ""} onChange={(e) => patch("payment.swift", e.target.value || null)} />
            </Field>
            <Field label="PayNow UEN">
              <Input value={config.payment.paynow_uen ?? ""} onChange={(e) => patch("payment.paynow_uen", e.target.value || null)} />
            </Field>
            <Field label="Queries email">
              <Input value={config.payment.queries_email ?? ""} onChange={(e) => patch("payment.queries_email", e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: "var(--space-4)" }}>
            <Checkbox
              label="The payment details above are the real ones — until this is ticked they print as “To confirm”"
              checked={config.payment.confirmed}
              onChange={(e) => patch("payment.confirmed", e.target.checked)}
            />
          </div>
        </section>

        <section className="pane">
          <h2>Terms</h2>
          <div className="field-grid">
            <Field label="Payment days" hint="Net 30 by default">
              <Input
                inputMode="numeric"
                value={String(config.terms.payment_days)}
                onChange={(e) => patch("terms.payment_days", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Quotation validity, days">
              <Input
                inputMode="numeric"
                value={String(config.terms.quotation_validity_days)}
                onChange={(e) => patch("terms.quotation_validity_days", Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Deposit on acceptance, %">
              <Input
                inputMode="numeric"
                value={String(config.terms.deposit_percent)}
                onChange={(e) => patch("terms.deposit_percent", Number(e.target.value) || 0)}
              />
            </Field>
          </div>
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            There is deliberately no late-payment clause. An interest charge nobody intends to enforce invites an
            argument and gets waived anyway. Add one here only once there is a policy behind it.
          </p>
        </section>

        <section className="pane">
          <h2>
            Grant note{" "}
            <Badge tone={grant.stale ? "warning" : "success"} dot>
              {grant.missing ? "no date" : grant.stale ? `${grant.days} days old` : "current"}
            </Badge>
          </h2>

          <Alert tone={grant.stale ? "warning" : "info"}>
            This note prints on quotations only. By invoice stage the project has commenced, and Enterprise Singapore
            requires an application before that point — so a note on an invoice is too late to be any use and risks
            implying the invoiced project qualifies.
          </Alert>

          <div className="field-grid" style={{ marginTop: "var(--space-4)" }}>
            <Field label="Scheme details last checked" hint="The app warns past 180 days">
              <Input
                type="date"
                value={config.panels.grant_note.checked_on ?? ""}
                onChange={(e) => patch("panels.grant_note.checked_on", e.target.value)}
              />
            </Field>
            <Field label=" ">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Icon name="Check" size={16} />}
                onClick={() => patch("panels.grant_note.checked_on", today())}
              >
                I checked it today
              </Button>
            </Field>
          </div>

          <Field label="Wording" hint="One paragraph per blank line. Plain text — no markup.">
            <Textarea
              rows={12}
              value={config.panels.grant_note.paragraphs.join("\n\n")}
              onChange={(e) =>
                patch(
                  "panels.grant_note.paragraphs",
                  e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
                )
              }
            />
          </Field>

          <Checkbox
            label="Show the grant note on quotations"
            checked={config.panels.grant_note.enabled !== false}
            onChange={(e) => patch("panels.grant_note.enabled", e.target.checked)}
          />
        </section>

        <section className="pane">
          <h2>Where the data lives</h2>
          <dl className="definition-list">
            <dt>Records</dt>
            <dd>{data.paths.data}</dd>
            <dt>Exported PDFs</dt>
            <dd>{data.paths.outputs}</dd>
          </dl>
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            Records live in the database, never in this repo. They are kept for at least five years, and an issued
            document cannot be changed or deleted there either.
          </p>
        </section>
      </div>
    </>
  );
}
