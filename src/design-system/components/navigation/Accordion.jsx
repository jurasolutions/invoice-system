import React from "react";

export function Accordion({ items = [], allowMultiple = false, style, ...rest }) {
  const [open, setOpen] = React.useState([]);
  const toggle = (i) =>
    setOpen((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : allowMultiple ? [...prev, i] : [i]
    );

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", ...style }} {...rest}>
      {items.map((item, i) => {
        const on = open.includes(i);
        return (
          <div key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => toggle(i)}
              aria-expanded={on}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: "var(--space-4)", padding: "var(--space-4) 0",
                background: "none", border: "none", cursor: "pointer", textAlign: "left",
                fontFamily: "var(--font-display)", fontSize: "var(--text-h4)",
                fontWeight: "var(--weight-medium)", color: "var(--text-strong)",
                minHeight: "var(--tap-min)",
              }}
            >
              {item.question || item.title}
              <span
                aria-hidden="true"
                style={{
                  flex: "0 0 auto", width: 24, height: 24, borderRadius: "50%",
                  border: "1px solid var(--border-subtle)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-brand)", fontSize: 14, lineHeight: 1,
                  transform: on ? "rotate(45deg)" : "none",
                  transition: "transform var(--dur-base) var(--ease-standard)",
                }}
              >
                +
              </span>
            </button>
            <div
              style={{
                display: "grid",
                gridTemplateRows: on ? "1fr" : "0fr",
                transition: "grid-template-rows var(--dur-base) var(--ease-standard)",
                overflow: "hidden",
              }}
            >
              <div style={{ minHeight: 0 }}>
                <p style={{ paddingBottom: "var(--space-5)", maxWidth: "var(--measure-prose)", color: "var(--text-body)", fontSize: "var(--text-body-sm)" }}>
                  {item.answer || item.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
