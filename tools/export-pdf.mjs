/**
 * Render a document to a PDF in `outputs/invoices/`.
 *
 *   npm run export -- JURA-2026-09-001
 *   npm run export -- --all
 *   npm run export -- doc_specimen_invoice
 *
 * The browser print dialog does the same job, but not the same way twice: the
 * file gets whatever name and folder the person picked, and the margins depend
 * on what the dialog was last set to. This script always writes
 * `<number>.pdf`, always at A4 with the page's own margins, so the PDF sitting
 * next to the JSON record five years from now is the one that was sent.
 *
 * It starts the app's own Vite server and drives it with headless Chromium, so
 * the PDF comes from exactly the renderer the preview uses. No second
 * code path to keep in step.
 */
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

import { paths } from "../backend/src/paths.mjs";
import { listDocuments } from "../backend/src/store.mjs";
import { findChrome } from "./find-chrome.mjs";
import { startPreview } from "./preview-server.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const all = args.includes("--all");
const targets = args.filter((arg) => !arg.startsWith("--"));

if (!all && targets.length === 0) {
  console.error("Usage: npm run export -- <number|id> [...]   or   npm run export -- --all");
  console.error("Example: npm run export -- JURA-2026-09-001");
  process.exit(1);
}

const chrome = findChrome();
await mkdir(paths.outputs, { recursive: true });

const documents = await listDocuments();
const wanted = all
  ? documents.filter((doc) => doc.number)
  : targets.map((target) => {
      const match = documents.find((doc) => doc.number === target || doc.id === target);
      if (!match) {
        console.error(`No document matching "${target}".`);
        process.exit(1);
      }
      return match;
    });

if (wanted.length === 0) {
  console.log("Nothing to export — no issued documents.");
  process.exit(0);
}

console.log(`Rendering with ${chrome}`);

const preview = await startPreview();

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

let failures = 0;

try {
  for (const summary of wanted) {
    const page = await browser.newPage();
    // A viewport as wide as the page, so nothing lays out against a narrow
    // window and then reflows for the print.
    await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 1 });
    // The API needs a session; these tools mint a real one rather than
    // bypassing the check. See tools/preview-server.mjs.
    await page.setExtraHTTPHeaders(preview.headers);

    const target = `${preview.url}/#/print/${encodeURIComponent(summary.number ?? summary.id)}`;
    await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });

    try {
      // The renderer sets this once the pages are laid out against the real
      // webfonts. Printing before then would capture the fallback layout.
      await page.waitForFunction(() => window.__juraReady === true, { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
    } catch {
      failures += 1;
      console.error(`  ${summary.number ?? summary.id}: the document never finished laying out. Not written.`);
      await page.close();
      continue;
    }

    const overflow = await page.evaluate(() => window.__juraOverflow ?? []);
    if (overflow.length > 0) {
      console.warn(`  ${summary.number}: something is taller than a page (${overflow.map((o) => o.key).join(", ")}).`);
    }

    const name = `${summary.number ?? summary.id}.pdf`;
    const out = join(paths.outputs, name);

    await page.pdf({
      path: out,
      format: "A4",
      // The page element carries its own 13/16/9mm margins, so the printer
      // must add none. Anything else scales the whole document down.
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });

    const { size } = await stat(out);
    const pageCount = await page.evaluate(() => window.__juraPageCount ?? 0);
    console.log(`  ${name}  ${pageCount} page${pageCount === 1 ? "" : "s"}  ${(size / 1024).toFixed(0)} kB`);
    await page.close();
  }
} finally {
  await browser.close();
  await preview.close();
}

console.log(`\nWritten to ${paths.outputs}`);
if (failures > 0) process.exit(1);
