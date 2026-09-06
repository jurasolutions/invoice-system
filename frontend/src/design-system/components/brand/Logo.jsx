import React from "react";

const MARK_COLORS = { green: "var(--green-600)", ink: "var(--neutral-900)", white: "#ffffff" };
let uid = 0;

/**
 * The Jura mark: a canopy with the branching structure cut out of it — a tree
 * and a process diagram in the same shape. Never restretch, recolour outside
 * MARK_COLORS, or add effects.
 */
export function Logo({ variant = "lockup", tone = "green", size = 36, showTagline = false, href, style, ...rest }) {
  const fill = MARK_COLORS[tone] || MARK_COLORS.green;
  const maskId = React.useMemo(() => "ju-mark-" + ++uid, []);
  const wordColor = tone === "white" ? "#ffffff" : "var(--neutral-900)";
  const subColor = tone === "white" ? "rgba(255,255,255,0.72)" : "var(--neutral-500)";

  const mark = (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden={variant !== "mark"} focusable="false" style={{ flex: "0 0 auto" }}>
      <mask id={maskId}>
        <rect width="48" height="48" fill="#fff" />
        <g fill="none" stroke="#000" strokeWidth="2.8" strokeLinecap="round">
          <path d="M24 31V11.5" /><path d="M24 21.5L17 15" /><path d="M24 21.5L31 15" />
        </g>
      </mask>
      <circle cx="24" cy="20" r="14.5" fill={fill} mask={`url(#${maskId})`} />
      <rect x="21.7" y="34" width="4.6" height="11" rx="2.3" fill={fill} />
    </svg>
  );

  const content =
    variant === "mark" ? mark : (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}>
        {mark}
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: size * 0.6, letterSpacing: "-0.02em", color: wordColor }}>
            <strong style={{ fontWeight: "var(--weight-semibold)" }}>Jura</strong>
            <span style={{ color: subColor, fontWeight: "var(--weight-regular)" }}> Solutions</span>
          </span>
          {showTagline && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: Math.max(9, size * 0.23),
              letterSpacing: "var(--tracking-overline)", textTransform: "uppercase",
              color: tone === "white" ? "var(--green-300)" : "var(--green-600)", marginTop: 6,
            }}>
              Automation consultancy
            </span>
          )}
        </span>
      </span>
    );

  const Tag = href ? "a" : "span";
  return (
    <Tag href={href} aria-label="Jura Solutions"
      style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", ...style }} {...rest}>
      {content}
    </Tag>
  );
}
