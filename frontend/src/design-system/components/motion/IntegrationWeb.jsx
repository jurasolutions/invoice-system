import React from "react";

const CSS = `
.ju-web { position:relative; width:100%; max-width:460px; margin-inline:auto; aspect-ratio:1/1; container-type:inline-size; }
.ju-web svg { position:absolute; inset:0; width:100%; height:100%; }
.ju-web-line { stroke:var(--neutral-200); stroke-width:1.5; fill:none; }
.ju-web-pulse {
  stroke:var(--green-500); stroke-width:2; fill:none;
  stroke-dasharray:14 200; stroke-linecap:round;
  animation: ju-web-dash var(--ju-web-dur) linear infinite;
}
.ju-web-node {
  position:absolute; transform:translate(-50%,-50%);
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; border-radius:var(--radius-full);
  border:1px solid var(--border-subtle); background:var(--white);
  font-size:0.8125rem; color:var(--text-body); white-space:nowrap;
  box-shadow:var(--shadow-xs);
  animation: ju-web-blink var(--ju-web-dur) var(--ease-in-out) infinite;
}
.ju-web-node i { width:6px; height:6px; border-radius:50%; background:var(--neutral-300); }
.ju-web-hub {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:84px; height:84px; border-radius:50%;
  background:var(--white); border:1px solid var(--green-200);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 0 8px rgba(31,111,74,0.05);
}
@keyframes ju-web-dash { to { stroke-dashoffset:-214; } }
@keyframes ju-web-blink {
  0%,100% { border-color:var(--border-subtle); }
  10%     { border-color:var(--green-400); }
  26%     { border-color:var(--border-subtle); }
}
@container (max-width: 380px) { .ju-web-node { font-size:0.75rem; padding:6px 10px; } .ju-web-hub { width:64px; height:64px; } }
@media (prefers-reduced-motion: reduce) { .ju-web-pulse, .ju-web-node { animation:none !important; } }
`;

const DEFAULT_SYSTEMS = ["Accounting", "CRM", "Email", "Spreadsheets", "Scheduling", "Inventory"];

/**
 * Disconnected systems wired into one hub, with data pulsing along each link.
 * The hub carries the Jura mark, so the diagram doubles as brand presence.
 */
export function IntegrationWeb({ systems = DEFAULT_SYSTEMS, duration = 3.2, style, ...rest }) {
  const n = systems.length;
  const radius = 40; // percent
  const pts = systems.map((label, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { label, x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a) };
  });

  return (
    <div style={{ containerType: "inline-size", width: "100%" }}>
      <style>{CSS}</style>
      <div className="ju-web" style={{ ["--ju-web-dur"]: `${duration}s`, ...style }} {...rest}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {pts.map((p, i) => (
          <line key={"l" + i} className="ju-web-line" x1={p.x} y1={p.y} x2="50" y2="50" />
        ))}
        {pts.map((p, i) => (
          <line
            key={"p" + i}
            className="ju-web-pulse"
            x1={p.x} y1={p.y} x2="50" y2="50"
            style={{ animationDelay: `${(i * duration) / n}s` }}
          />
        ))}
      </svg>
      <div className="ju-web-hub">
        <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true">
          <mask id="ju-web-mark">
            <rect width="48" height="48" fill="#fff" />
            <g fill="none" stroke="#000" strokeWidth="2.8" strokeLinecap="round">
              <path d="M24 31V11.5" /><path d="M24 21.5L17 15" /><path d="M24 21.5L31 15" />
            </g>
          </mask>
          <circle cx="24" cy="20" r="14.5" fill="var(--green-600)" mask="url(#ju-web-mark)" />
          <rect x="21.7" y="34" width="4.6" height="11" rx="2.3" fill="var(--green-600)" />
        </svg>
      </div>
      {pts.map((p, i) => (
        <div
          key={p.label}
          className="ju-web-node"
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${(i * duration) / n}s` }}
        >
          <i />{p.label}
        </div>
      ))}
      </div>
    </div>
  );
}
