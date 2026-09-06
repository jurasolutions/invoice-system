/**
 * Pagination check, against a real browser.
 *
 *   npm run check:layout
 *
 * The unit tests cover the arithmetic. They cannot cover the thing that
 * actually goes wrong, which is a height measured from the DOM being wrong —
 * a row that reports zero because a marker attribute never reached it, a
 * layout computed before the webfonts landed, a block whose margin was not
 * counted. Every one of those produces a document that looks fine until the
 * last line falls off the bottom of a page.
 *
 * So this builds a document long enough to need three pages, renders it in
 * Chromium, and asserts three things about the result:
 *
 *   nothing overflows its page box
 *   the page numbers run 1..N and agree with the number of pages
 *   a section that spans a page boundary repeats its header, and every item
 *   that went in came out somewhere
 *
 * It runs against a temporary data tree, so it never touches real records.
 */
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "jura-layout-"));
process.env.JURA_DATA_PATH = join(root, "data/invoices");
process.env.JURA_OUTPUT_PATH = join(root, "outputs");

const { createServer } = await import("vite");
const puppeteer = (await import("puppeteer-core")).default;
const { findChrome } = await import("./find-chrome.mjs");
const { paths, repoRoot } = await import("../server/paths.mjs");
const { writeJsonAtomic } = await import("../server/atomic.mjs");
const { emptyCounters } = await import("../src/domain/numbering.js");
const { defaultConfig } = await import("./seed-config.mjs");

const ITEMS_PER_SECTION = 9;
const SECTIONS = 5;

await mkdir(paths.documents, { recursive: true });
await mkdir(paths.templates, { recursive: true });

const config = defaultConfig();
config.company.uen = "202612345K";
config.company.uen_confirmed = true;
config.company.address_confirmed = true;
await writeJsonAtomic(paths.config, config);
await writeJsonAtomic(paths.counters, emptyCounters());
await writeJsonAtomic(paths.clients, []);

const sections = Array.from({ length: SECTIONS }, (_, s) => ({
  id: `sec_${s}`,
  title: `Workstream ${s + 1}`,
  meta: `Phase ${s + 1}`,
  items: Array.from({ length: ITEMS_PER_SECTION }, (_, i) => ({
    id: `itm_${s}_${i}`,
    description: `Line item ${s + 1}.${i + 1} — a description long enough to occupy the column it sits in`,
    // Every third item carries a note, so rows are not all the same height.
    note: i % 3 === 0 ? "A note under the description, which makes this row taller than the others around it." : "",
    qty: (i % 4) + 1,
    unit_price_cents: 12345 * (i + 1),
  })),
}));

const totalItems = SECTIONS * ITEMS_PER_SECTION;

await writeJsonAtomic(join(paths.documents, "doc_layout_check.json"), {
  id: "doc_layout_check",
  type: "invoice",
  number: "JURA-2026-09-001",
  status: "issued",
  issued_at: "2026-09-06",
  client_id: "cli_check",
  client_snapshot: {
    client_id: "cli_check",
    name: "A Long Document Test Client Pte. Ltd.",
    attention: "Someone, a job title",
    address_lines: ["1 Test Road, #01-01", "Singapore 100001"],
    email: "accounts@example.test",
    uen: "",
  },
  company_snapshot: {
    legal_name: config.company.legal_name,
    uen: config.company.uen,
    uen_confirmed: true,
    address_lines: config.company.address_lines,
    address_confirmed: true,
    email: config.company.email,
    website: config.company.website,
  },
  reference: "PO-0001",
  currency: "SGD",
  terms_days: 30,
  due_date: "2026-10-06",
  sections,
  adjustments: [],
  payments: [],
  gst: { registered: false, rate_bp: 900, number: null },
  panels: ["how_to_pay", "notes"],
  notes: "A note on the document, printed in place of the default notes panel.",
  specimen: true,
  links: { quotation_id: null, invoice_id: null, receipt_ids: [], credit_note_ids: [], corrects_id: null },
  created_at: "2026-09-06T00:00:00.000Z",
  updated_at: "2026-09-06T00:00:00.000Z",
  schema_version: 1,
});

const server = await createServer({
  root: repoRoot,
  configFile: join(repoRoot, "vite.config.mjs"),
  server: { port: 0, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1400 });

const failures = [];

try {
  await page.goto(`${url}/#/print/JURA-2026-09-001`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => window.__juraReady === true, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  const result = await page.evaluate(() => {
    const pages = [...document.querySelectorAll(".print-sheet .ju-page")];
    return {
      overflow: window.__juraOverflow ?? [],
      pageCount: pages.length,
      pages: pages.map((element) => {
        const style = getComputedStyle(element);
        const body = element.querySelector(".ju-page-body");
        const head = element.querySelector(".ju-head, .ju-cont");
        const foot = element.querySelector(".ju-foot");
        const contentBox =
          element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const used =
          head.getBoundingClientRect().height +
          body.getBoundingClientRect().height +
          foot.getBoundingClientRect().height;
        return {
          used: +used.toFixed(1),
          available: +contentBox.toFixed(1),
          footerText: foot.querySelector(".ju-page-no")?.textContent?.trim() ?? "",
          sectionHeads: [...element.querySelectorAll(".ju-section-head h3")].map((h) => h.textContent.trim()),
          itemCells: element.querySelectorAll(".ju-section tbody tr:not(.ju-subtotal) td:first-child").length,
          hasContinuationHeader: Boolean(element.querySelector(".ju-cont")),
        };
      }),
    };
  });

  console.log(`Rendered ${totalItems} items across ${SECTIONS} sections → ${result.pageCount} pages`);

  if (result.pageCount < 3) {
    failures.push(`expected at least 3 pages, got ${result.pageCount}`);
  }

  if (result.overflow.length > 0) {
    failures.push(`renderer reported overflow: ${result.overflow.map((o) => o.key).join(", ")}`);
  }

  result.pages.forEach((info, index) => {
    const number = index + 1;
    const expected = `Page ${number} of ${result.pageCount}`;
    console.log(
      `  page ${number}: ${info.used}/${info.available}px used, ${info.itemCells} rows, "${info.footerText}"`
    );

    // A page whose content is taller than its box has had something clipped by
    // `overflow: hidden`. That is the failure this whole mechanism exists to
    // prevent, so it is checked directly rather than inferred.
    if (info.used > info.available + 1) {
      failures.push(`page ${number} overflows its box by ${(info.used - info.available).toFixed(1)}px`);
    }

    if (info.footerText !== expected) {
      failures.push(`page ${number} footer reads "${info.footerText}", expected "${expected}"`);
    }

    if (number > 1 && !info.hasContinuationHeader) {
      failures.push(`page ${number} has no continuation header`);
    }

    if (info.sectionHeads.length === 0 && info.itemCells > 0) {
      failures.push(`page ${number} has item rows with no section header above them`);
    }
  });

  const renderedItems = result.pages.reduce((sum, info) => sum + info.itemCells, 0);
  if (renderedItems !== totalItems) {
    failures.push(`${totalItems} items went in but ${renderedItems} came out`);
  }

  const continuedHeads = result.pages
    .flatMap((info) => info.sectionHeads)
    .filter((head) => head.endsWith("(continued)"));
  console.log(`  ${continuedHeads.length} section(s) continued across a page break`);
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("\nFAILED:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("\nLayout is sound: nothing clipped, page numbers correct, every item present.");
