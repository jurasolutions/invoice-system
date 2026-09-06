import React from "react";

/**
 * Frame for every Jura motion graphic: quiet grid background, hairline border,
 * mono caption. Keeps the animated pieces visually consistent wherever they land.
 */
export function MotionPanel({ caption, tone = "light", padding = "var(--space-5)", children, style, ...rest }) {
  const dark = tone === "dark";
  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${dark ? "var(--green-800)" : "var(--border-subtle)"}`,
        background: dark ? "var(--green-900)" : "var(--white)",
        backgroundImage: dark
          ? "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)"
          : "linear-gradient(var(--neutral-100) 1px, transparent 1px), linear-gradient(90deg, var(--neutral-100) 1px, transparent 1px)",
        backgroundSize: "32px 32px, 32px 32px",
        padding,
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {children}
      {caption && (
        <div
          style={{
            marginTop: "var(--space-4)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-caption)",
            letterSpacing: "0.04em",
            color: dark ? "var(--green-300)" : "var(--text-muted)",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
