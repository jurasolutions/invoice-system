import React from "react";

const row = {
  display: "flex", alignItems: "flex-start", gap: "var(--space-3)",
  cursor: "pointer", minHeight: "var(--tap-min)", padding: "6px 0",
};
const labelText = { fontSize: "var(--text-body-sm)", color: "var(--text-body)", lineHeight: "var(--leading-normal)" };

export function Checkbox({ label, checked, onChange, disabled, style, ...rest }) {
  return (
    <label style={{ ...row, opacity: disabled ? 0.5 : 1, ...style }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      <span
        aria-hidden="true"
        style={{
          width: 20, height: 20, flex: "0 0 auto", marginTop: 2,
          borderRadius: "var(--radius-xs)",
          border: `1px solid ${checked ? "var(--brand)" : "var(--border-default)"}`,
          background: checked ? "var(--brand)" : "var(--white)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--white)", fontSize: 13, lineHeight: 1,
          transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={labelText}>{label}</span>
    </label>
  );
}

export function Radio({ label, checked, onChange, name, disabled, style, ...rest }) {
  return (
    <label style={{ ...row, opacity: disabled ? 0.5 : 1, ...style }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      <span
        aria-hidden="true"
        style={{
          width: 20, height: 20, flex: "0 0 auto", marginTop: 2, borderRadius: "50%",
          border: `1px solid ${checked ? "var(--brand)" : "var(--border-default)"}`,
          background: "var(--white)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color var(--dur-fast) var(--ease-standard)",
        }}
      >
        {checked && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--brand)" }} />}
      </span>
      <span style={labelText}>{label}</span>
    </label>
  );
}

export function Switch({ label, checked, onChange, disabled, style, ...rest }) {
  return (
    <label style={{ ...row, alignItems: "center", opacity: disabled ? 0.5 : 1, ...style }}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} {...rest} />
      <span
        aria-hidden="true"
        style={{
          width: 44, height: 26, flex: "0 0 auto", borderRadius: "var(--radius-full)",
          background: checked ? "var(--brand)" : "var(--neutral-300)",
          padding: 3, display: "flex", alignItems: "center",
          transition: "background var(--dur-base) var(--ease-standard)",
        }}
      >
        <span
          style={{
            width: 20, height: 20, borderRadius: "50%", background: "var(--white)",
            boxShadow: "var(--shadow-sm)",
            transform: checked ? "translateX(18px)" : "translateX(0)",
            transition: "transform var(--dur-base) var(--ease-standard)",
          }}
        />
      </span>
      {label && <span style={labelText}>{label}</span>}
    </label>
  );
}
