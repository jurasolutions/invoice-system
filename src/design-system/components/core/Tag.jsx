import React from "react";

export function Tag({ children, selected = false, onRemove, icon, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const clickable = !!rest.onClick;
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
        padding: "6px var(--space-3)",
        borderRadius: "var(--radius-full)",
        border: `1px solid ${selected ? "var(--brand)" : "var(--border-subtle)"}`,
        background: selected ? "var(--brand-subtle)" : hover && clickable ? "var(--neutral-50)" : "var(--white)",
        color: selected ? "var(--text-brand)" : "var(--text-body)",
        fontSize: "var(--text-body-sm)",
        fontWeight: selected ? "var(--weight-semibold)" : "var(--weight-regular)",
        cursor: clickable ? "pointer" : "default",
        transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(e); }}
          aria-label="Remove"
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1, fontSize: 15 }}
        >
          ×
        </button>
      )}
    </span>
  );
}
