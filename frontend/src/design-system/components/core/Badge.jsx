import React from "react";

const TONES = {
  neutral: { background: "var(--neutral-100)", color: "var(--neutral-700)", border: "var(--neutral-200)" },
  brand: { background: "var(--brand-subtle)", color: "var(--text-brand)", border: "var(--brand-border)" },
  success: { background: "var(--success-bg)", color: "var(--success-fg)", border: "var(--green-200)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning-fg)", border: "var(--amber-100)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger-fg)", border: "var(--red-100)" },
  info: { background: "var(--info-bg)", color: "var(--info-fg)", border: "var(--blue-100)" },
};

export function Badge({ children, tone = "brand", dot = false, mono = false, style, ...rest }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
        padding: "3px var(--space-3)",
        background: t.background, color: t.color,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-full)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        fontSize: "var(--text-caption)",
        fontWeight: mono ? 400 : "var(--weight-semibold)",
        letterSpacing: mono ? "0.06em" : "0.01em",
        textTransform: mono ? "uppercase" : "none",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color }} />}
      {children}
    </span>
  );
}
