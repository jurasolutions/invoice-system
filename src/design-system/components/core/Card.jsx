import React from "react";

export function Card({
  children,
  interactive = false,
  tone = "default",
  padding = "var(--space-5)",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const tones = {
    default: { background: "var(--surface-card)", border: "1px solid var(--border-subtle)" },
    sunken: { background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" },
    brand: { background: "var(--brand-subtle)", border: "1px solid var(--brand-border)" },
    inverse: { background: "var(--green-900)", border: "1px solid var(--green-800)", color: "var(--green-50)" },
  };
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: "var(--radius-lg)",
        padding,
        boxShadow: interactive && hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: interactive && hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard)",
        borderColor: interactive && hover ? "var(--brand-border)" : undefined,
        ...tones[tone],
        ...(interactive && hover && tone === "default" ? { borderColor: "var(--brand-border)" } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
