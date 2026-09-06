/**
 * Clients.
 *
 * A separate list from `data/projects.json` on purpose: the entity that pays
 * an invoice and the client a project is delivered for are often not the same
 * name, and the one on the document has to be the one that pays.
 */
import React from "react";

import { Badge, Button, Field, Icon, Input, Textarea } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";

export function Clients() {
  const { data, run } = useApp();
  const [editing, setEditing] = React.useState(null);

  const save = async (client) => {
    const saved = await run(() => api.saveClient(client), { success: "Client saved." });
    if (saved) setEditing(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>
            The billing entity, as it should appear on a document. A document keeps a copy of these details as they
            were on the day it was issued, so editing a client here never changes a document already sent.
          </p>
        </div>
        <span className="spacer" />
        <Button
          size="sm"
          iconLeft={<Icon name="Plus" size={16} />}
          onClick={() => setEditing({ id: `cli_${Date.now().toString(36)}`, name: "", address_lines: [] })}
        >
          New client
        </Button>
      </div>

      <div className="container stack">
        {editing ? <ClientForm client={editing} onSave={save} onCancel={() => setEditing(null)} /> : null}

        {data.clients.length === 0 && !editing ? (
          <div className="empty">No clients yet.</div>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Attention</th>
                <th>Email</th>
                <th>Documents</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client) => {
                const count = data.documents.filter((doc) => doc.client_name === client.name).length;
                return (
                  <tr key={client.id}>
                    <td>
                      <strong>{client.name}</strong>
                      {client.specimen ? (
                        <Badge tone="warning" mono style={{ marginLeft: "var(--space-2)" }}>
                          Specimen
                        </Badge>
                      ) : null}
                      <div className="muted">{(client.address_lines ?? []).join(", ")}</div>
                    </td>
                    <td>{client.attention}</td>
                    <td>{client.email}</td>
                    <td className="num">{count}</td>
                    <td className="right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(client)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={count > 0}
                        title={count > 0 ? "This client is on a document. Deleting it would leave that document referring to nothing." : undefined}
                        onClick={async () => {
                          if (!window.confirm(`Delete ${client.name}?`)) return;
                          await run(() => api.deleteClient(client.id), { success: "Client deleted." });
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ClientForm({ client, onSave, onCancel }) {
  const [form, setForm] = React.useState({
    ...client,
    address: (client.address_lines ?? []).join("\n"),
  });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="pane">
      <h2>{client.name ? `Edit ${client.name}` : "New client"}</h2>
      <div className="field-grid">
        <Field label="Name" required hint="Exactly as it should appear on the document">
          <Input value={form.name ?? ""} onChange={set("name")} />
        </Field>
        <Field label="Attention">
          <Input value={form.attention ?? ""} onChange={set("attention")} placeholder="Rachel Ong, operations manager" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="UEN" hint="Optional">
          <Input value={form.uen ?? ""} onChange={set("uen")} />
        </Field>
      </div>
      <Field label="Address" hint="One line per line">
        <Textarea rows={3} value={form.address ?? ""} onChange={set("address")} />
      </Field>
      <div className="row" style={{ marginTop: "var(--space-3)" }}>
        <Button
          size="sm"
          disabled={!form.name?.trim()}
          onClick={() => {
            const { address, ...rest } = form;
            onSave({
              ...rest,
              name: form.name.trim(),
              address_lines: address.split("\n").map((line) => line.trim()).filter(Boolean),
            });
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
