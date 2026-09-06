import React from "react";

const SIZES = {
  sm: { h: "var(--control-h-sm)", px: "var(--space-3)", fs: "var(--text-body-sm)" },
  md: { h: "var(--control-h-md)", px: "var(--space-5)", fs: "var(--text-body-sm)" },
  lg: { h: "var(--control-h-lg)", px: "var(--space-6)", fs: "var(--text-body)" },
};

const VARIANTS = {
  primary: {
    background: "var(--brand)", color: "var(--brand-on)", border: "1px solid var(--brand)",
    hover: { background: "var(--brand-hover)", borderColor: "var(--brand-hover)" },
  },
  secondary: {
    background: "var(--white)", color: "var(--text-strong)", border: "1px solid var(--border-default)",
    hover: { background: "var(--brand-subtle)", borderColor: "var(--brand-border)", color: "var(--text-brand)" },
  },
  ghost: {
    background: "transparent", color: "var(--text-brand)", border: "1px solid transparent",
    hover: { background: "var(--brand-subtle)" },
  },
  inverse: {
    background: "var(--white)", color: "var(--green-800)", border: "1px solid var(--white)",
    hover: { background: "var(--green-50)" },
  },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled = false,
  as,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const Tag = as || (rest.href ? "a" : "button");

  return (
    <Tag
      disabled={Tag === "button" ? disabled : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-2)",
        minHeight: s.h,
        padding: `0 ${s.px}`,
        fontFamily: "var(--font-body)",
        fontSize: s.fs,
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "0.005em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        textDecoration: "none",
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-instant) var(--ease-standard)",
        transform: down && !disabled ? "scale(0.985)" : "none",
        ...v,
        ...(hover && !disabled ? v.hover : null),
        hover: undefined,
        ...style,
      }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Tag>
  );
}
