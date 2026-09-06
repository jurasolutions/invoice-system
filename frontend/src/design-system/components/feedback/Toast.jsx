import React from "react";

export function Toast({ message, tone = "success", icon, open = true, onClose, style, ...rest }) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [open, onClose]);

  const accent = tone === "danger" ? "var(--danger-fg)" : tone === "warning" ? "var(--warning-fg)" : "var(--green-400)";
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--green-900)", color: "var(--green-50)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
        fontSize: "var(--text-body-sm)",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(8px)",
        transition: "opacity var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
        pointerEvents: open ? "auto" : "none",
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, flex: "0 0 auto" }} />
      {icon}
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Close"
          style={{ background: "none", border: "none", color: "var(--green-200)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      )}
    </div>
  );
}
