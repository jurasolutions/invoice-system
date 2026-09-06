import React from "react";

import { Alert, Icon, Logo, Toast } from "./ds.js";
import { AppProvider, useApp } from "./app/store.jsx";
import { href, useRoute } from "./app/router.js";
import { Dashboard } from "./app/Dashboard.jsx";
import { Builder } from "./app/Builder.jsx";
import { PrintView } from "./app/PrintView.jsx";
import { Clients } from "./app/Clients.jsx";
import { Templates } from "./app/Templates.jsx";
import { Settings } from "./app/Settings.jsx";
import { grantNoteAge } from "./domain/document.js";

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { status, error, data, toasts } = useApp();

  if (status === "loading") {
    return <Splash>Loading…</Splash>;
  }

  if (status === "error") {
    return (
      <Splash>
        <Alert tone="danger" title="Cannot read the data">
          {error?.message}
          <br />
          <br />
          If this is a fresh checkout, run <code>npm run seed</code> once to create the data tree, then reload.
        </Alert>
      </Splash>
    );
  }

  // The print route is the document and nothing else — no app chrome, so what
  // is on screen is exactly what goes on the paper.
  if (route.name === "print") {
    return <PrintView id={route.params.id} />;
  }

  return (
    <div className="app">
      <AppBar route={route} />
      <ConfigWarnings config={data.config} />
      <main className={`app-main${route.name === "document" ? " app-main--wide" : ""}`}>
        {route.name === "dashboard" ? <Dashboard /> : null}
        {route.name === "document" ? <Builder id={route.params.id} /> : null}
        {route.name === "clients" ? <Clients /> : null}
        {route.name === "templates" ? <Templates /> : null}
        {route.name === "settings" ? <Settings /> : null}
        {route.name === "not-found" ? (
          <div className="container">
            <Alert tone="warning" title="No such page">
              <a href={href.dashboard()}>Back to documents</a>
            </Alert>
          </div>
        ) : null}
      </main>

      <div className="toast-host">
        {toasts.map((t) => (
          <Toast key={t.id} tone={t.tone} message={t.message} style={{ maxWidth: 460 }} />
        ))}
      </div>
    </div>
  );
}

function AppBar({ route }) {
  const { data } = useApp();
  const links = [
    ["dashboard", href.dashboard(), "Documents", "FileText"],
    ["clients", href.clients(), "Clients", "Users"],
    ["templates", href.templates(), "Templates", "Copy"],
    ["settings", href.settings(), "Settings", "Settings"],
  ];

  return (
    <header className="app-bar">
      <a href={href.dashboard()} aria-label="Jura Solutions invoicing" style={{ display: "inline-flex" }}>
        <Logo size={28} />
      </a>
      <nav>
        {links.map(([name, url, label, icon]) => (
          <a key={name} href={url} aria-current={route.name === name ? "page" : undefined}>
            <Icon name={icon} size={16} />
            {label}
          </a>
        ))}
      </nav>
      <span className="spacer" />
      <span className="muted mono" title={data.paths.data}>
        {shortPath(data.paths.data)}
      </span>
    </header>
  );
}

/**
 * The two things that would put a wrong document in front of a client.
 *
 * Both are warnings rather than blocks here, because drafting is still useful
 * while they stand. Issuing is what they block, and that check lives in the
 * store where it cannot be clicked past.
 */
function ConfigWarnings({ config }) {
  const grant = grantNoteAge(config);
  const placeholders = [];
  if (!config.company?.uen_confirmed) placeholders.push("UEN");
  if (!config.company?.address_confirmed) placeholders.push("registered address");
  if (!config.payment?.confirmed) placeholders.push("payment details");

  if (placeholders.length === 0 && !grant.stale) return null;

  return (
    <div className="container" style={{ padding: "var(--space-4) var(--space-5) 0" }}>
      <div className="stack">
        {placeholders.length > 0 ? (
          <Alert tone="warning" title="Company details still to confirm">
            {sentence(placeholders)} {placeholders.length === 1 ? "is" : "are"} still a placeholder in{" "}
            <code>config.json</code>. Documents will show it in grey and cannot be issued until you replace it and
            set the matching <code>_confirmed</code> flag. <a href={href.settings()}>Open settings</a>
          </Alert>
        ) : null}

        {grant.stale ? (
          <Alert tone="warning" title="The grant note needs checking">
            {grant.missing
              ? "The grant note has no checked-on date."
              : `The grant note was last checked ${grant.days} days ago.`}{" "}
            Enterprise Singapore is consolidating EDG, PSG and MRA into a single EDGE scheme during the second half
            of 2026. Check the wording against enterprisesg.gov.sg, then update the date.{" "}
            <a href={href.settings()}>Open settings</a>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function Splash({ children }) {
  return (
    <div className="app">
      <header className="app-bar">
        <Logo size={28} />
      </header>
      <main className="app-main">
        <div className="container--narrow">{children}</div>
      </main>
    </div>
  );
}

function sentence(items) {
  if (items.length === 1) return capitalise(items[0]);
  return capitalise(`${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function shortPath(path) {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts.slice(-3).join("/");
}
