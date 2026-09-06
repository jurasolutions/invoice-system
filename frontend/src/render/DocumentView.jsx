/**
 * The document, laid out on A4 pages.
 *
 * Two passes. The first renders every block off-screen at the exact width it
 * will have on the page and measures it. The second fills page boxes with
 * those measurements, so "Page 2 of 3" is a fact rather than a hope and
 * nothing is clipped at a boundary.
 *
 * Measuring happens twice: once immediately, and again once the webfonts have
 * loaded. Outfit and DM Sans are not the same height as the fallback, and a
 * layout computed against Helvetica would break the pages in the wrong places
 * for about a hundred milliseconds — long enough for a headless export to
 * catch it.
 */
import React from "react";
import { createPortal } from "react-dom";

import { DocHead, ContHead, DocFooter } from "./blocks.jsx";
import { buildFlow, TableChunk } from "./flow.jsx";
import { paginate } from "./paginate.js";

export function DocumentView({ doc, config, mode = "screen", onLayout }) {
  const flow = React.useMemo(() => buildFlow(doc, config), [doc, config]);
  const [layout, setLayout] = React.useState(null);
  const rigRef = React.useRef(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useLayoutEffect(() => {
    if (!mounted) return undefined;
    let live = true;

    const run = () => {
      if (!live || !rigRef.current) return;
      const measurements = measureRig(rigRef.current, flow);
      if (!measurements) return;
      setLayout(paginate(flow, measurements.blocks, measurements.geometry));
    };

    run();

    // Fonts change every height on the page, so lay out again once they land.
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) run();
    });

    return () => {
      live = false;
      cancelled = true;
    };
  }, [flow, mounted]);

  // Held in a ref so a caller passing an inline callback cannot turn this
  // into a render loop.
  const onLayoutRef = React.useRef(onLayout);
  onLayoutRef.current = onLayout;
  React.useEffect(() => {
    if (layout) onLayoutRef.current?.(layout);
  }, [layout]);

  const pages = layout?.pages ?? [];
  const pageCount = Math.max(pages.length, 1);

  return (
    <div className={`ju-doc ${mode === "screen" ? "ju-doc--screen" : "ju-doc--print"}`} data-ready={layout ? "true" : "false"}>
      {pages.map((page, index) => (
        <section className="ju-page" key={index}>
          <div className="ju-topbar">
            <i />
          </div>
          {index === 0 ? <DocHead doc={doc} config={config} /> : <ContHead doc={doc} />}
          <div className="ju-page-body">
            {page.placements.map((placement) =>
              placement.kind === "simple" ? (
                <React.Fragment key={placement.key}>{placement.node}</React.Fragment>
              ) : (
                <TableChunk key={placement.key} item={placement.item} rows={placement.rows} continued={placement.continued} />
              )
            )}
          </div>
          <DocFooter doc={doc} config={config} page={index + 1} pageCount={pageCount} />
        </section>
      ))}

      {mounted ? createPortal(<MeasureRig ref={rigRef} doc={doc} config={config} flow={flow} />, document.body) : null}
    </div>
  );
}

/**
 * The off-screen copy everything is measured against.
 *
 * It is positioned off to the left rather than hidden. `display: none` and
 * `visibility: hidden` both give every element a height of zero, which is not
 * a measurement.
 */
const MeasureRig = React.forwardRef(function MeasureRig({ doc, config, flow }, ref) {
  return (
    <div className="ju-doc ju-measure" ref={ref} aria-hidden="true">
      {/* Ask the browser how much room the flow actually gets, rather than
          adding up paddings and hoping the arithmetic agrees. */}
      <div className="ju-page ju-measure-page" data-measure-page="first">
        <div className="ju-topbar">
          <i />
        </div>
        <DocHead doc={doc} config={config} />
        <div className="ju-page-body" />
        <DocFooter doc={doc} config={config} page={1} pageCount={2} />
      </div>

      <div className="ju-page ju-measure-page" data-measure-page="cont">
        <div className="ju-topbar">
          <i />
        </div>
        <ContHead doc={doc} />
        <div className="ju-page-body" />
        <DocFooter doc={doc} config={config} page={2} pageCount={2} />
      </div>

      <div className="ju-gap-probe" data-measure-gap="" />

      {flow.map((item) =>
        item.kind === "simple" ? (
          <div data-measure={item.key} key={item.key}>
            {item.node}
          </div>
        ) : (
          <div data-measure={item.key} key={item.key}>
            <div className="ju-section">
              <div data-measure-part="head">{item.head}</div>
              <table>
                {item.columns}
                {React.cloneElement(item.thead, { "data-measure-part": "thead" })}
                <tbody>
                  {item.rows.map((row) => React.cloneElement(row.node, { key: row.key, "data-measure-row": row.key }))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
});

/**
 * Read every height the paginator needs off the rig.
 *
 * Returns null rather than a partial answer if anything cannot be found. A
 * missing measurement reads as a height of zero, and a block believed to be
 * zero high gets packed onto a page that has no room for it — which is how you
 * end up with an invoice whose total is clipped off the bottom edge. On a
 * document a client keeps for five years, no layout is better than a wrong
 * one: the page stays unready, the export refuses, and the problem is visible.
 */
function measureRig(rig, flow) {
  const firstPage = rig.querySelector('[data-measure-page="first"] .ju-page-body');
  const contPage = rig.querySelector('[data-measure-page="cont"] .ju-page-body');
  const gapProbe = rig.querySelector("[data-measure-gap]");
  if (!firstPage || !contPage || !gapProbe) return null;

  const geometry = {
    firstAvail: firstPage.getBoundingClientRect().height,
    contAvail: contPage.getBoundingClientRect().height,
    gap: gapProbe.getBoundingClientRect().height,
  };

  const blocks = {};
  for (const item of flow) {
    const element = rig.querySelector(`[data-measure="${cssEscape(item.key)}"]`);
    if (!element) {
      console.error(`[jura] could not measure block "${item.key}" — not laying out.`);
      return null;
    }

    if (item.kind === "simple") {
      blocks[item.key] = { height: element.getBoundingClientRect().height };
      continue;
    }

    const head = element.querySelector('[data-measure-part="head"]');
    const thead = element.querySelector('[data-measure-part="thead"]');
    if (!head || !thead) {
      console.error(`[jura] could not measure the header of "${item.key}" — not laying out.`);
      return null;
    }

    const rowHeights = {};
    for (const row of item.rows) {
      const tr = element.querySelector(`[data-measure-row="${cssEscape(row.key)}"]`);
      if (!tr) {
        console.error(`[jura] could not measure row "${row.key}" of "${item.key}" — not laying out.`);
        return null;
      }
      rowHeights[row.key] = tr.getBoundingClientRect().height;
    }

    blocks[item.key] = {
      headHeight: head.getBoundingClientRect().height,
      theadHeight: thead.getBoundingClientRect().height,
      rowHeights,
    };
  }

  return { geometry, blocks };
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
