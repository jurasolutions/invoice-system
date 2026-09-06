import React from "react";

const CSS = `
.ju-pipe { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:var(--space-4); container-type:inline-size; }
.ju-pipe-col { display:flex; flex-direction:column; justify-content:center; gap:var(--space-2); min-width:0; }
.ju-pipe-doc {
  display:flex; align-items:center; gap:var(--space-3);
  border:1px solid var(--border-subtle); border-radius:var(--radius-sm);
  background:var(--white); padding:10px var(--space-3);
  font-size:0.8125rem; color:var(--text-body);
  animation: ju-pipe-in var(--ju-pipe-dur) var(--ease-in-out) infinite;
}
.ju-pipe-doc span:first-child { width:8px; height:20px; border-radius:2px; background:var(--neutral-200); flex:0 0 auto; }
.ju-pipe-out {
  display:flex; align-items:center; gap:var(--space-3);
  border:1px solid var(--green-200); border-radius:var(--radius-sm);
  background:var(--green-50); padding:10px var(--space-3);
  font-size:0.8125rem; color:var(--green-700); font-weight:600;
  animation: ju-pipe-out var(--ju-pipe-dur) var(--ease-in-out) infinite;
}
.ju-pipe-out span:first-child { width:8px; height:20px; border-radius:2px; background:var(--green-400); flex:0 0 auto; }
.ju-pipe-core {
  position:relative; width:88px; height:88px; border-radius:var(--radius-md);
  border:1px solid var(--green-200); background:var(--white);
  display:flex; align-items:center; justify-content:center; flex:0 0 auto;
}
.ju-pipe-core::before {
  content:""; position:absolute; inset:-1px; border-radius:var(--radius-md);
  border:1px solid var(--green-400);
  animation: ju-pipe-ring var(--ju-pipe-dur) var(--ease-in-out) infinite;
}
.ju-pipe-core-label { font-family:var(--font-mono); font-size:10px; letter-spacing:0.08em; color:var(--green-700); text-align:center; }
@keyframes ju-pipe-in {
  0%   { opacity:0; transform:translateX(-14px); }
  6%   { opacity:1; transform:translateX(0); }
  72%  { opacity:1; transform:translateX(0); }
  80%  { opacity:0; transform:translateX(14px); }
  100% { opacity:0; transform:translateX(14px); }
}
@keyframes ju-pipe-out {
  0%     { opacity:1; transform:translateX(0); }
  6%     { opacity:0; transform:translateX(-10px); }
  44%    { opacity:0; transform:translateX(-10px); }
  56%    { opacity:1; transform:translateX(0); }
  100%   { opacity:1; transform:translateX(0); }
}
@keyframes ju-pipe-ring {
  0%,100% { opacity:0; transform:scale(1); }
  50%     { opacity:0.9; transform:scale(1.12); }
}
@container (max-width: 620px) {
  .ju-pipe { gap:var(--space-3); }
  .ju-pipe-doc, .ju-pipe-out { padding:8px 10px; font-size:0.75rem; gap:8px; }
  .ju-pipe-doc span:first-child, .ju-pipe-out span:first-child { width:6px; height:16px; }
  .ju-pipe-core { width:60px; height:60px; }
  .ju-pipe-core-label { font-size:9px; }
}
@container (max-width: 340px) {
  .ju-pipe { grid-template-columns:1fr 1fr; grid-template-areas:"core core" "in out"; row-gap:var(--space-3); }
  .ju-pipe-col:first-of-type { grid-area:in; }
  .ju-pipe-col:last-of-type { grid-area:out; }
  .ju-pipe-core { grid-area:core; justify-self:center; }
}
@media (prefers-reduced-motion: reduce) {
  .ju-pipe-doc, .ju-pipe-out, .ju-pipe-core::before { animation:none !important; opacity:1 !important; transform:none !important; }
}
`;

/**
 * Paperwork going in, filed records coming out. Used wherever the value story is
 * "documents handled without anyone typing them in".
 */
export function DocumentPipeline({
  incoming = ["Invoice PDF", "Timesheet", "Purchase order"],
  outgoing = ["Posted to ledger", "Approved"],
  coreLabel = "JURA\nBOT",
  duration = 5.6,
  style,
  ...rest
}) {
  const stagger = 0.28;
  return (
    <div style={{ containerType: "inline-size", width: "100%" }}>
      <style>{CSS}</style>
      <div className="ju-pipe" style={{ ["--ju-pipe-dur"]: `${duration}s`, ...style }} {...rest}>
      <div className="ju-pipe-col">
        {incoming.map((d, i) => (
          <div className="ju-pipe-doc" key={d} style={{ animationDelay: `${i * stagger}s` }}>
            <span /><span>{d}</span>
          </div>
        ))}
      </div>
      <div className="ju-pipe-core">
        <span className="ju-pipe-core-label" style={{ whiteSpace: "pre-line" }}>{coreLabel}</span>
      </div>
      <div className="ju-pipe-col">
        {outgoing.map((d, i) => (
          <div className="ju-pipe-out" key={d} style={{ animationDelay: `${i * stagger}s` }}>
            <span /><span>{d}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
