import React from "react";

const CSS = `
.ju-dash { display:grid; gap:var(--space-3); grid-template-columns:repeat(3, 1fr); container-type:inline-size; }
.ju-dash-tile { border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--white); padding:var(--space-3) var(--space-4); display:flex; flex-direction:column; gap:6px; }
.ju-dash-k { font-family:var(--font-mono); font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted); }
.ju-dash-v { font-family:var(--font-display); font-weight:600; font-size:1.5rem; color:var(--text-strong); letter-spacing:-0.02em; line-height:1; font-variant-numeric:tabular-nums; }
.ju-dash-wide { grid-column:1 / -1; }
.ju-dash-bars { display:flex; align-items:flex-end; gap:6px; height:76px; }
.ju-dash-bar { flex:1; border-radius:3px 3px 0 0; background:var(--green-200); transition:height 700ms var(--ease-out), background 700ms var(--ease-out); }
.ju-dash-bar.on { background:var(--green-600); }
.ju-dash-live { display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono); font-size:10px; letter-spacing:0.08em; color:var(--green-600); }
.ju-dash-live i { width:6px; height:6px; border-radius:50%; background:var(--green-500); animation: ju-dash-pulse 1.6s var(--ease-in-out) infinite; }
@keyframes ju-dash-pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
@container (max-width: 480px) { .ju-dash { grid-template-columns:repeat(2, 1fr); } }
@media (prefers-reduced-motion: reduce) { .ju-dash-live i { animation:none; } .ju-dash-bar { transition:none; } }
`;

const rand = (min, max) => Math.round(min + Math.random() * (max - min));

/**
 * A live operations board ticking over: bars redraw, counters step, status stays
 * green. Purposely shows no client-specific figures — the values are illustrative.
 */
export function LiveDashboard({
  title = "This week",
  tiles = [
    { key: "Jobs run", from: 120, to: 180 },
    { key: "Hours saved", from: 20, to: 40 },
    { key: "Exceptions", from: 0, to: 3 },
  ],
  bars = 12,
  interval = 2200,
  style,
  ...rest
}) {
  const [vals, setVals] = React.useState(() => tiles.map((t) => rand(t.from, t.to)));
  const [heights, setHeights] = React.useState(() => Array.from({ length: bars }, () => rand(30, 100)));

  React.useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => {
      setVals(tiles.map((t) => rand(t.from, t.to)));
      setHeights(Array.from({ length: bars }, () => rand(30, 100)));
    }, interval);
    return () => clearInterval(id);
  }, [bars, interval, JSON.stringify(tiles)]);

  const peak = Math.max(...heights);

  return (
    <div style={{ containerType: "inline-size", width: "100%" }}>
      <style>{CSS}</style>
      <div className="ju-dash" style={style} {...rest}>
      {tiles.map((t, i) => (
        <div className="ju-dash-tile" key={t.key}>
          <span className="ju-dash-k">{t.key}</span>
          <span className="ju-dash-v">{vals[i]}</span>
        </div>
      ))}
      <div className="ju-dash-tile ju-dash-wide">
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ju-dash-k">{title}</span>
          <span className="ju-dash-live"><i />LIVE</span>
        </span>
        <div className="ju-dash-bars">
          {heights.map((h, i) => (
            <span key={i} className={"ju-dash-bar" + (h === peak ? " on" : "")} style={{ height: `${h}%` }} />
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
