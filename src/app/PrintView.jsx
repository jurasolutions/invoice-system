/**
 * The document on its own, ready for the printer.
 *
 * No app chrome, so what is on screen is exactly what lands on the paper. The
 * bar at the top is hidden by the print stylesheet.
 *
 * `window.__juraReady` is the signal the export script waits for: it goes true
 * once the pages have been laid out against the real webfonts. Exporting
 * before then would capture a layout computed against the fallback face and
 * break the pages in the wrong places.
 */
import React from "react";

import { Button, Icon } from "../ds.js";
import { useApp } from "./store.jsx";
import { api } from "./api.js";
import { href } from "./router.js";
import { DocumentView } from "../render/DocumentView.jsx";

export function PrintView({ id }) {
  const { data } = useApp();
  const [doc, setDoc] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // Accept a document number as well as an id, so the export script can ask
    // for JURA-2026-09-001 without looking anything up first.
    const fetchDoc = id.startsWith("doc_") ? api.readDocument(id) : api.readByNumber(id);
    fetchDoc.then(setDoc).catch(setError);
  }, [id]);

  const onLayout = React.useCallback((layout) => {
    window.__juraPageCount = layout.pages.length;
    window.__juraOverflow = layout.overflow;
    // Two frames, so the DOM the layout produced has actually painted.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__juraReady = true;
      document.documentElement.setAttribute("data-jura-ready", "true");
    }));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "var(--space-8)" }}>
        <p>{error.message}</p>
        <a href={href.dashboard()}>Back to documents</a>
      </div>
    );
  }

  if (!doc) return <div style={{ padding: "var(--space-8)" }}>Loading…</div>;

  return (
    <>
      <div className="print-bar no-print">
        <Button variant="secondary" size="sm" href={href.document(doc.id)} iconLeft={<Icon name="ArrowLeft" size={16} />}>
          Back to the document
        </Button>
        <Button size="sm" onClick={() => window.print()} iconLeft={<Icon name="Printer" size={16} />}>
          Print or save as PDF
        </Button>
        <span className="muted">
          Set the printer to A4 with margins off. The page already carries its own margins, so the browser adding more
          would shrink the whole document.
        </span>
      </div>
      <div className="print-sheet">
        <DocumentView doc={doc} config={data.config} mode="screen" onLayout={onLayout} />
      </div>
    </>
  );
}
