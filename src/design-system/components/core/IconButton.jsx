import React from "react";

const SIZES = { sm: 34, md: 42, lg: 48 };

export function IconButton({ icon, label, variant = "secondary", size = "md", style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const d = SIZES[size] || SIZES.md;
  const tones = {
    secondary: { background: "var(--white)", border: "1px solid var(--border-default)", color: "var(--text-body)" },
    ghost: { background: "transparent", border: "1px solid transparent", color: "var(--text-body)" },
    brand: { background: "var(--brand)", border: "1px solid var(--brand)", color: "var(--white)" },
  };
  const hovers = {
    secondary: { background: "var(--brand-subtle)", borderColor: "var(--brand-border)", color: "var(--text-brand)" },
    ghost: { background: "var(--neutral-100)" },
    brand: { background: "var(--brand-hover)", borderColor: "var(--brand-hover)" },
  };
  return (
    <button
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: d, height: d, minWidth: d,
        borderRadius: "var(--radius-sm)", cursor: "pointer",
        transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
        ...tones[variant], ...(hover ? hovers[variant] : null), ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
