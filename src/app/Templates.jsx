/**
 * Templates.
 *
 * Read-only here on purpose. A template is edited by building a document from
 * it and saving it back, which is the only way to see what you are actually
 * changing. This screen is for knowing what exists and for deleting one.
 */
import React from "react";

import { Alert, Button, Icon } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { formatCents } from "../domain/money.js";
import { TYPE_LABEL } from "../domain/numbering.js";

export function Templates() {
  const { data, run } = useApp();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Templates</h1>
          <p>
            A template carries sections, items and default rates. Applying one fills a draft; editing that draft never
            writes back here.
          </p>
        </div>
      </div>

      <div className="container stack">
        <Alert tone="info" title="The templates that ship carry no rates">
          Jura's commercial rates are a business decision, and a template full of invented numbers is exactly how a
          guess ends up on a client's document. Build a document from a template, put your rates in, then save it back
          over the same name.
        </Alert>

        {data.templates.map((template) => (
          <div className="pane" key={template.slug}>
            <div className="row">
              <div>
                <strong>{template.name}</strong>
                <div className="muted">{template.description}</div>
              </div>
              <span className="spacer" style={{ marginLeft: "auto" }} />
              <span className="muted mono">{TYPE_LABEL[template.document_type] ?? template.document_type}</span>
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<Icon name="Trash2" size={16} />}
                onClick={async () => {
                  if (!window.confirm(`Delete the "${template.name}" template? Documents built from it are unaffected.`)) return;
                  await run(() => api.deleteTemplate(template.slug), { success: "Template deleted." });
                }}
              >
                Delete
              </Button>
            </div>

            <table className="doc-table" style={{ marginTop: "var(--space-3)" }}>
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Item</th>
                  <th className="right">Qty</th>
                  <th className="right">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {(template.sections ?? []).flatMap((section, sectionIndex) =>
                  (section.items ?? []).map((item, itemIndex) => (
                    <tr key={`${sectionIndex}-${itemIndex}`}>
                      <td>{itemIndex === 0 ? section.title || <span className="muted">Untitled</span> : ""}</td>
                      <td>{item.description || <span className="muted">Blank</span>}</td>
                      <td className="right num">{item.qty}</td>
                      <td className="right num">
                        {item.unit_price_cents == null ? <span className="muted">to set</span> : formatCents(item.unit_price_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
