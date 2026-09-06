import React from "react";

const DEFAULT_STEPS = [
  { label: "Trigger", detail: "Email, form, file" },
  { label: "Read", detail: "Extract the data" },
  { label: "Act", detail: "Update the systems" },
  { label: "Confirm", detail: "Notify the team" },
];

const CSS = `
.ju-flow { display:flex; align-items:stretch; gap:0; container-type:inline-size; }
.ju-flow-step {
  flex:1 1 0; min-width:0; position:relative;
  border:1px solid var(--border-subtle); border-radius:var(--radius-md);
  background:var(--white); padding:var(--space-4);
  display:flex; flex-direction:column; gap:4px;
  animation: ju-flow-wake var(--ju-flow-dur) var(--ease-in-out) infinite;
}
.ju-flow-step-i { font-family:var(--font-mono); font-size:11px; letter-spacing:0.1em; color:var(--green-600); }
.ju-flow-step-l { font-family:var(--font-display); font-size:1rem; font-weight:600; color:var(--text-strong); letter-spacing:-0.01em; }
.ju-flow-step-d { font-size:0.8125rem; color:var(--text-muted); line-height:1.35; }
@container (max-width: 780px) {
  .ju-flow-step { padding:var(--space-3); }
  .ju-flow-link { flex-basis:24px; }
  @keyframes ju-flow-travel {
    0% { transform:translateX(-4px); opacity:0; }
    8% { opacity:1; }
    30% { transform:translateX(20px); opacity:1; }
    38% { transform:translateX(20px); opacity:0; }
    100% { transform:translateX(20px); opacity:0; }
  }
}
.ju-flow-link { flex:0 0 46px; position:relative; align-self:center; height:2px; background:var(--neutral-200); }
.ju-flow-link::after {
  content:""; position:absolute; top:-3px; left:0; width:8px; height:8px; border-radius:50%;
  background:var(--green-600);
  animation: ju-flow-travel var(--ju-flow-dur) var(--ease-in-out) infinite;
}
@keyframes ju-flow-wake {
  0%,100% { border-color:var(--border-subtle); box-shadow:none; }
  8%      { border-color:var(--green-400); box-shadow:0 0 0 3px rgba(31,111,74,0.10); }
  22%     { border-color:var(--border-subtle); box-shadow:none; }
}
@keyframes ju-flow-travel {
  0%    { transform:translateX(-4px); opacity:0; }
  8%    { opacity:1; }
  30%   { transform:translateX(42px); opacity:1; }
  38%   { transform:translateX(42px); opacity:0; }
  100%  { transform:translateX(42px); opacity:0; }
}
@container (max-width: 620px) {
  .ju-flow { flex-direction:column; }
  .ju-flow-link { width:2px; height:26px; flex:0 0 26px; margin-left:22px; align-self:flex-start; }
  .ju-flow-link::after { top:0; left:-3px; animation-name: ju-flow-travel-y; }
  @keyframes ju-flow-travel-y {
    0% { transform:translateY(-4px); opacity:0; }
    8% { opacity:1; }
    30% { transform:translateY(22px); opacity:1; }
    38% { transform:translateY(22px); opacity:0; }
    100% { transform:translateY(22px); opacity:0; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .ju-flow-step, .ju-flow-link::after { animation:none !important; }
  .ju-flow-link::after { opacity:1; transform:none; }
}
`;

/**
 * The house diagram: a job moving left to right through a Jura automation.
 * Each stage wakes in sequence and a token travels between them, on a single
 * shared loop so the rhythm reads as one process rather than four animations.
 */
export function AutomationFlow({ steps = DEFAULT_STEPS, duration = 4.8, style, ...rest }) {
  const stagger = duration / steps.length;
  return (
    <div style={{ containerType: "inline-size", width: "100%" }}>
      <style>{CSS}</style>
      <div className="ju-flow" style={{ ["--ju-flow-dur"]: `${duration}s`, ...style }} {...rest}>
      {steps.map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <span className="ju-flow-link" style={{ animationDelay: `${(i - 0.5) * stagger}s` }} />}
          <div className="ju-flow-step" style={{ animationDelay: `${i * stagger}s` }}>
            <span className="ju-flow-step-i">{String(i + 1).padStart(2, "0")}</span>
            <span className="ju-flow-step-l">{s.label}</span>
            <span className="ju-flow-step-d">{s.detail}</span>
          </div>
        </React.Fragment>
      ))}
      </div>
    </div>
  );
}
