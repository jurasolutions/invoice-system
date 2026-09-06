import React from "react";

const CSS = `
.ju-meter { display:flex; flex-direction:column; gap:var(--space-3); }
.ju-meter-top { display:flex; align-items:baseline; gap:8px; }
.ju-meter-num { font-family:var(--font-display); font-weight:700; letter-spacing:-0.03em; color:var(--green-700); line-height:1; }
.ju-meter-suffix { font-family:var(--font-display); font-weight:600; color:var(--green-600); }
.ju-meter-track { height:10px; border-radius:var(--radius-full); background:var(--neutral-100); overflow:hidden; }
.ju-meter-fill {
  height:100%; border-radius:var(--radius-full);
  background:linear-gradient(90deg, var(--green-500), var(--green-600));
  transition:width 1.6s var(--ease-out);
}
.ju-meter-label { font-size:var(--text-body-sm); color:var(--text-muted); }
`;

/**
 * Counts a proportion up on entry. Deliberately expresses ranges ("80%+")
 * rather than invented client counts — Jura only claims what it can defend.
 */
export function EffortMeter({ value = 80, suffix = "%+", label = "of the manual steps removed", style, ...rest }) {
  const [n, setN] = React.useState(0);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(value); return; }
    let raf, start;
    const run = () => {
      const step = (t) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / 1400);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { run(); io.disconnect(); }
    }, { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);

  return (
    <div className="ju-meter" ref={ref} style={style} {...rest}>
      <style>{CSS}</style>
      <div className="ju-meter-top">
        <span className="ju-meter-num" style={{ fontSize: "var(--text-display-2)" }}>{n}</span>
        <span className="ju-meter-suffix" style={{ fontSize: "var(--text-h3)" }}>{suffix}</span>
      </div>
      <div className="ju-meter-track"><div className="ju-meter-fill" style={{ width: `${n}%` }} /></div>
      <span className="ju-meter-label">{label}</span>
    </div>
  );
}
