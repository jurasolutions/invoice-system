import React from "react";

const pascal = (s) => s.split(/[-_ ]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

/**
 * Lucide icon wrapper (substitution — Jura has no bespoke icon set; see readme
 * ICONOGRAPHY). Requires the lucide UMD script on the page.
 */
export function Icon({ name, size = 20, strokeWidth = 1.75, color = "currentColor", style, ...rest }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const draw = () => {
      if (cancelled || !ref.current) return;
      const L = window.lucide;
      const node = L && ((L.icons && L.icons[pascal(name)]) || L[pascal(name)]);
      if (!node || !L.createElement) {
        if (tries++ < 40) setTimeout(draw, 100);
        return;
      }
      const svg = L.createElement(node);
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
      svg.setAttribute("stroke-width", strokeWidth);
      svg.setAttribute("stroke", color);
      svg.style.display = "block";
      ref.current.innerHTML = "";
      ref.current.appendChild(svg);
    };
    draw();
    return () => { cancelled = true; };
  }, [name, size, strokeWidth, color]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{ display: "inline-flex", width: size, height: size, flex: "0 0 auto", ...style }}
      {...rest}
    />
  );
}
