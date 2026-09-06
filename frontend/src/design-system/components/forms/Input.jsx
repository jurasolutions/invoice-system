import React from "react";

const base = (invalid, focus, disabled) => ({
  width: "100%",
  minHeight: "var(--control-h-md)",
  padding: "0 var(--space-3)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-body)",
  color: "var(--text-strong)",
  background: disabled ? "var(--neutral-50)" : "var(--white)",
  border: `1px solid ${invalid ? "var(--danger-fg)" : focus ? "var(--border-focus)" : "var(--border-default)"}`,
  borderRadius: "var(--radius-sm)",
  boxShadow: focus ? "var(--focus-ring)" : "none",
  outline: "none",
  transition: "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
});

export function Input({ invalid = false, iconLeft, style, disabled, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const field = (
    <input
      disabled={disabled}
      onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
      style={{ ...base(invalid, focus, disabled), paddingLeft: iconLeft ? "38px" : undefined, ...style }}
      {...rest}
    />
  );
  if (!iconLeft) return field;
  return (
    <span style={{ position: "relative", display: "block" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
        {iconLeft}
      </span>
      {field}
    </span>
  );
}

export function Textarea({ invalid = false, rows = 4, style, disabled, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <textarea
      rows={rows}
      disabled={disabled}
      onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
      style={{ ...base(invalid, focus, disabled), minHeight: undefined, padding: "var(--space-3)", lineHeight: "var(--leading-normal)", resize: "vertical", ...style }}
      {...rest}
    />
  );
}
