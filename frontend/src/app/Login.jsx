/**
 * Sign in.
 *
 * The only screen reachable without a session. It says nothing about what is
 * behind it and gives one message for a wrong username and a wrong password
 * alike — naming which half was wrong tells someone guessing that the username
 * exists, which is half the work done for them.
 */
import React from "react";

import { Alert, Button, Field, Input, Logo } from "../ds.js";
import { api, ApiError } from "./api.js";

export function Login({ onSignedIn }) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(username.trim(), password);
      onSignedIn(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <form className="signin__card" onSubmit={submit}>
        <Logo size={34} showTagline />

        <div className="signin__intro">
          <h1>Invoicing</h1>
          <p className="muted">Quotations, invoices and receipts.</p>
        </div>

        {error ? (
          <Alert tone="danger" title="Could not sign you in">
            {error}
          </Alert>
        ) : null}

        <Field label="Username">
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" fullWidth disabled={busy || !username.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
