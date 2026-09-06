import React from "react";

export function Dialog({ open, title, description, children, footer, onClose, width = 520, style, ...rest }) {
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(12, 44, 29, 0.42)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-4)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: width,
          background: "var(--white)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          padding: "var(--space-6)",
          display: "flex", flexDirection: "column", gap: "var(--space-4)",
          animation: "ju-dialog-in var(--dur-slow) var(--ease-out) both",
          ...style,
        }}
        {...rest}
      >
        <style>{"@keyframes ju-dialog-in{from{opacity:0;transform:translateY(10px) scale(0.99)}to{opacity:1;transform:none}}"}</style>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {title && <h3 style={{ fontSize: "var(--text-h3)", margin: 0 }}>{title}</h3>}
            {description && <p style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>{description}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--text-muted)", padding: 0 }}>×</button>
          )}
        </div>
        {children}
        {footer && <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
