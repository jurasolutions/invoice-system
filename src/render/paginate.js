/**
 * Deciding where the pages break.
 *
 * The browser can break pages on its own, and it does it badly for this: it
 * cannot repeat a section header, it cannot put a continuation header on page
 * two, and it cannot tell you how many pages there will be, which is what
 * "Page 1 of 3" needs. So the heights are measured first and the pages are
 * filled here, deliberately.
 *
 * Pure arithmetic. The measuring lives in DocumentView, the rendering lives in
 * the blocks, and this decides only what goes where.
 */

/**
 * A chunk of a table has to be worth the header that sits above it. One
 * orphaned row under a repeated header reads as a mistake.
 */
const MIN_ROWS_PER_CHUNK = 2;

/**
 * @param flow          blocks from buildFlow()
 * @param measured      { [key]: { height } | { headHeight, theadHeight, rowHeights: {[rowKey]: h} } }
 * @param geometry      { firstAvail, contAvail, gap } in px
 * @returns { pages, overflow } — pages of placements, and any block too tall
 *          for a whole page, which the app surfaces rather than clipping.
 */
export function paginate(flow, measured, geometry) {
  const { firstAvail, contAvail, gap } = geometry;
  if (!(firstAvail > 0) || !(contAvail > 0)) return { pages: [], overflow: [] };

  const pages = [];
  const overflow = [];
  let current = { placements: [], used: 0, available: firstAvail };

  const flush = () => {
    pages.push(current);
    current = { placements: [], used: 0, available: contAvail };
  };
  const remaining = () => current.available - current.used;
  const leadingGap = () => (current.placements.length > 0 ? gap : 0);

  for (const item of flow) {
    const m = measured[item.key];
    if (!m) continue;

    if (item.kind === "simple") {
      placeSimple(item, m);
      continue;
    }

    placeTable(item, m);
  }

  if (current.placements.length > 0 || pages.length === 0) flush();

  return { pages, overflow };

  function placeSimple(item, m) {
    const height = m.height ?? 0;
    if (leadingGap() + height > remaining() && current.placements.length > 0) flush();

    // Taller than an entire empty page. Nothing to be done about it here, but
    // it must not be silently clipped — the caller warns.
    if (height > current.available) overflow.push({ key: item.key, height, available: current.available });

    current.used += leadingGap() + height;
    current.placements.push({ kind: "simple", key: item.key, node: item.node });
  }

  function placeTable(item, m) {
    const rows = item.rows.map((row) => ({ ...row, height: m.rowHeights?.[row.key] ?? 0 }));
    if (rows.length === 0) return;

    const overhead = (m.headHeight ?? 0) + (m.theadHeight ?? 0);
    let index = 0;
    let continued = false;

    while (index < rows.length) {
      const available = remaining() - leadingGap() - overhead;
      let count = 0;
      let used = 0;
      while (index + count < rows.length && used + rows[index + count].height <= available) {
        used += rows[index + count].height;
        count += 1;
      }

      // Never leave the subtotal stranded on the next page by itself. Keeping
      // one real row with it costs a line and reads correctly.
      const remainingAfter = rows.length - (index + count);
      if (remainingAfter === 1 && rows[rows.length - 1].kind === "subtotal" && count > MIN_ROWS_PER_CHUNK) {
        count -= 1;
        used -= rows[index + count].height;
      }

      const isFirstOnPage = current.placements.length === 0;

      if (count < MIN_ROWS_PER_CHUNK && !isFirstOnPage) {
        // Not enough room to start this table here. Try a fresh page.
        flush();
        continue;
      }

      if (count === 0) {
        // A single row taller than a page. Place it rather than looping, and
        // report it — clipping content silently is the one outcome that is
        // never acceptable on a document a client keeps.
        count = 1;
        overflow.push({ key: item.key, row: rows[index].key, height: rows[index].height, available });
      }

      const slice = rows.slice(index, index + count);
      current.used += leadingGap() + overhead + slice.reduce((sum, row) => sum + row.height, 0);
      current.placements.push({
        kind: "table",
        key: `${item.key}${continued ? `-cont-${index}` : ""}`,
        item,
        rows: slice,
        continued,
      });

      index += count;
      continued = true;
      if (index < rows.length) flush();
    }
  }
}

/**
 * Which page each block landed on, for the builder's "this is on page 2"
 * affordance. Cheap to derive and easier than threading it through the render.
 */
export function pageIndexByKey(pages) {
  const index = {};
  pages.forEach((page, pageIndex) => {
    for (const placement of page.placements) {
      const key = placement.kind === "table" ? placement.item.key : placement.key;
      if (!(key in index)) index[key] = pageIndex;
    }
  });
  return index;
}
