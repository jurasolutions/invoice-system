import React from "react";

export function Tabs({ tabs = [], value, onChange, style, ...rest }) {
  const [internal, setInternal] = React.useState(tabs[0] && (tabs[0].id || tabs[0]));
  const active = value !== undefined ? value : internal;
  const select = (id) => { setInternal(id); onChange && onChange(id); };

  return (
    <div
      role="tablist"
      style={{
        display: "flex", gap: "var(--space-5)",
        borderBottom: "1px solid var(--border-subtle)",
        overflowX: "auto", scrollbarWidth: "none",
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const id = t.id || t;
        const label = t.label || t;
        const on = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => select(id)}
            style={{
              appearance: "none", background: "none", border: "none",
              padding: "var(--space-3) 0",
              marginBottom: -1,
              borderBottom: `2px solid ${on ? "var(--brand)" : "transparent"}`,
              color: on ? "var(--text-strong)" : "var(--text-muted)",
              fontSize: "var(--text-body-sm)",
              fontWeight: on ? "var(--weight-semibold)" : "var(--weight-regular)",
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
