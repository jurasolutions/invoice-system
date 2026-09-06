/**
 * The live A4 preview.
 *
 * It is the real document at real size, scaled down with a transform. That is
 * the point: rendering it small would break lines in different places and stop
 * being a preview of anything. The measuring rig the paginator uses lives in a
 * portal on `document.body`, outside this transform, so the heights it reads
 * are unscaled.
 */
import React from "react";

import { DocumentView } from "../render/DocumentView.jsx";

// 210mm at 96dpi.
const PAGE_WIDTH_PX = 793.7;

export function PreviewPane({ doc, config }) {
  const frameRef = React.useRef(null);
  const [scale, setScale] = React.useState(0.4);
  const [layout, setLayout] = React.useState(null);

  React.useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const measure = () => {
      const available = frame.clientWidth - 2; // a hair, so the shadow is not clipped
      setScale(Math.min(1, available / PAGE_WIDTH_PX));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const pageCount = layout?.pages?.length ?? 0;
  const overflow = layout?.overflow ?? [];

  return (
    <>
      <h2>Live A4 preview</h2>
      <div className="preview-meta">
        <span className={doc.number ? "dot" : "dot dot--draft"} />
        <span>
          {doc.number ? `${doc.number} · issued` : "Draft · not yet numbered"}
          {pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {overflow.length > 0 ? (
        <p className="muted" style={{ color: "var(--warning-fg)", fontSize: "var(--text-caption)", marginBottom: "var(--space-2)" }}>
          Something on this document is taller than a page and has been placed anyway rather than clipped. Shorten the
          longest note or split the section.
        </p>
      ) : null}

      <div className="preview-frame" ref={frameRef} style={{ height: previewHeight(scale, pageCount) }}>
        <div className="preview-scale" style={{ transform: `scale(${scale})` }}>
          <DocumentView doc={doc} config={config} mode="screen" onLayout={setLayout} />
        </div>
      </div>
    </>
  );
}

/**
 * The scaled stack of pages, plus the 8mm gap the screen mode puts between
 * them. Without this the frame would collapse to nothing — a transform does
 * not change how much room an element takes up.
 */
function previewHeight(scale, pageCount) {
  const PAGE_HEIGHT_PX = 1122.5; // 297mm at 96dpi
  const GAP_PX = 30.2; // 8mm
  const pages = Math.max(pageCount, 1);
  return Math.round((PAGE_HEIGHT_PX * pages + GAP_PX * (pages - 1)) * scale) + 24;
}
