import React from "react";

export function Field({ label, hint, error, required = false, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", ...style }} {...rest}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{
            fontSize: "var(--text-body-sm)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text-strong)",
          }}
        >
          {label}
          {required && <span style={{ color: "var(--danger-fg)", marginLeft: 4 }}>*</span>}
        </label>
      )}
      {children}
      {(error || hint) && (
        <span
          style={{
            fontSize: "var(--text-caption)",
            color: error ? "var(--danger-fg)" : "var(--text-muted)",
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
