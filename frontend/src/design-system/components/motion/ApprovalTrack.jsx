import React from "react";

const CSS = `
.ju-track { display:flex; flex-direction:column; gap:var(--space-4); }
.ju-track-rail { position:relative; display:flex; justify-content:space-between; padding-top:6px; }
.ju-track-rail::before {
  content:""; position:absolute; left:12px; right:12px; top:16px; height:2px; background:var(--neutral-200);
}
.ju-track-fill {
  position:absolute; left:12px; top:16px; height:2px; background:var(--green-600);
  animation: ju-track-fill var(--ju-track-dur) var(--ease-in-out) infinite;
}
.ju-track-stage { position:relative; display:flex; flex-direction:column; align-items:center; gap:8px; flex:1; min-width:0; }
.ju-track-dot {
  width:22px; height:22px; border-radius:50%; background:var(--white);
  border:2px solid var(--neutral-300); display:flex; align-items:center; justify-content:center;
  color:var(--white); font-size:11px; line-height:1;
  animation: ju-track-dot var(--ju-track-dur) var(--ease-in-out) infinite;
}
.ju-track-name { font-size:0.8125rem; color:var(--text-muted); text-align:center; line-height:1.25;
  animation: ju-track-name var(--ju-track-dur) var(--ease-in-out) infinite; }
.ju-track-card {
  display:flex; align-items:center; justify-content:space-between; gap:var(--space-3);
  border:1px solid var(--border-subtle); border-radius:var(--radius-md);
  background:var(--white); padding:var(--space-3) var(--space-4);
}
.ju-track-card-t { font-family:var(--font-display); font-weight:600; font-size:0.9375rem; color:var(--text-strong); }
.ju-track-card-s { font-family:var(--font-mono); font-size:11px; letter-spacing:0.06em; color:var(--green-600); }
@keyframes ju-track-fill {
  0%   { width:0; }
  85%  { width:calc(100% - 24px); }
  100% { width:calc(100% - 24px); }
}
@keyframes ju-track-dot {
  0%, 12%   { border-color:var(--neutral-300); background:var(--white); }
  22%, 100% { border-color:var(--green-600); background:var(--green-600); }
}
@keyframes ju-track-name {
  0%, 12%   { color:var(--text-muted); }
  22%, 100% { color:var(--text-strong); }
}
@media (prefers-reduced-motion: reduce) {
  .ju-track-fill, .ju-track-dot, .ju-track-name { animation:none !important; }
  .ju-track-fill { width:calc(100% - 24px); }
  .ju-track-dot { border-color:var(--green-600); background:var(--green-600); }
}
`;

const DEFAULT_STAGES = ["Submitted", "Checked", "Approved", "Paid"];

/**
 * An approval walking through its stages on a loop. Shows the part of automation
 * clients feel most: things stop sitting in someone's inbox.
 */
export function ApprovalTrack({
  stages = DEFAULT_STAGES,
  title = "Leave request — M. Tan",
  meta = "auto-routed",
  duration = 5.2,
  style,
  ...rest
}) {
  return (
    <div className="ju-track" style={{ ["--ju-track-dur"]: `${duration}s`, ...style }} {...rest}>
      <style>{CSS}</style>
      <div className="ju-track-card">
        <span className="ju-track-card-t">{title}</span>
        <span className="ju-track-card-s">{meta}</span>
      </div>
      <div className="ju-track-rail">
        <span className="ju-track-fill" />
        {stages.map((s, i) => (
          <span className="ju-track-stage" key={s}>
            <span className="ju-track-dot" style={{ animationDelay: `${(i * duration) / (stages.length + 0.6)}s` }}>✓</span>
            <span className="ju-track-name" style={{ animationDelay: `${(i * duration) / (stages.length + 0.6)}s` }}>{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
