import React from "react";

export function Tooltip({ label, placement = "top", children, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const pos = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
    left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  }[placement];

  return (
    <span
      style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...rest}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: "absolute", ...pos, zIndex: 40,
          padding: "6px var(--space-3)",
          background: "var(--neutral-900)", color: "var(--white)",
          borderRadius: "var(--radius-xs)",
          fontSize: "var(--text-caption)", whiteSpace: "nowrap",
          opacity: open ? 1 : 0,
          transition: "opacity var(--dur-fast) var(--ease-standard)",
          pointerEvents: "none",
        }}
      >
        {label}
      </span>
    </span>
  );
}
