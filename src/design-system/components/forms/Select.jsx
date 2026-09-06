import React from "react";

export function Select({ options = [], placeholder = "Select…", invalid = false, style, disabled, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "block" }}>
      <select
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%", minHeight: "var(--control-h-md)",
          padding: "0 36px 0 var(--space-3)",
          fontFamily: "var(--font-body)", fontSize: "var(--text-body)",
          color: "var(--text-strong)",
          background: disabled ? "var(--neutral-50)" : "var(--white)",
          border: `1px solid ${invalid ? "var(--danger-fg)" : focus ? "var(--border-focus)" : "var(--border-default)"}`,
          borderRadius: "var(--radius-sm)",
          boxShadow: focus ? "var(--focus-ring)" : "none",
          appearance: "none", outline: "none", cursor: disabled ? "not-allowed" : "pointer",
          transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
          ...style,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o : o.label;
          return <option key={value} value={value}>{label}</option>;
        })}
      </select>
      <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)", fontSize: 11 }}>▼</span>
    </span>
  );
}
