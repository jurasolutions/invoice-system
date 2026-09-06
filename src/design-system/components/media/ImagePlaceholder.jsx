import React from "react";

/**
 * Striped placeholder standing in for real photography or screen recordings.
 * Every unfilled image slot in a Jura mock uses this, labelled with what belongs there.
 */
export function ImagePlaceholder({
  label = "image",
  ratio = "16 / 9",
  radius = "var(--radius-lg)",
  tone = "light",
  height,
  style,
  ...rest
}) {
  const light = tone === "light";
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        aspectRatio: height ? undefined : ratio,
        height,
        width: "100%",
        borderRadius: radius,
        border: `1px solid ${light ? "var(--border-subtle)" : "var(--green-800)"}`,
        background: light
          ? "repeating-linear-gradient(135deg, var(--neutral-50) 0 10px, var(--white) 10px 20px)"
          : "repeating-linear-gradient(135deg, var(--green-900) 0 10px, var(--green-800) 10px 20px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--text-caption)",
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: light ? "var(--neutral-500)" : "var(--green-300)",
          background: light ? "rgba(255,255,255,0.85)" : "rgba(12,44,29,0.85)",
          padding: "4px var(--space-3)", borderRadius: "var(--radius-full)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
