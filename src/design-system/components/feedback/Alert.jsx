import React from "react";

const TONES = {
  info: { bg: "var(--info-bg)", fg: "var(--info-fg)", bd: "var(--blue-100)" },
  success: { bg: "var(--success-bg)", fg: "var(--success-fg)", bd: "var(--green-200)" },
  warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)", bd: "var(--amber-100)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger-fg)", bd: "var(--red-100)" },
};

export function Alert({ tone = "info", title, children, icon, onDismiss, style, ...rest }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div
      role="status"
      style={{
        display: "flex", gap: "var(--space-3)", alignItems: "flex-start",
        padding: "var(--space-4)",
        background: t.bg, border: `1px solid ${t.bd}`,
        borderRadius: "var(--radius-md)",
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.fg, marginTop: 1 }}>{icon}</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {title && <strong style={{ fontSize: "var(--text-body-sm)", color: t.fg, fontWeight: "var(--weight-semibold)" }}>{title}</strong>}
        {children && <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-body)" }}>{children}</span>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss"
          style={{ background: "none", border: "none", cursor: "pointer", color: t.fg, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      )}
    </div>
  );
}
