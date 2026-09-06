/**
 * Check an exported PDF is actually the document it should be.
 *
 *   npm run verify -- JURA-2026-09-001
 *   npm run verify -- --all
 *
 * Three things are worth checking, and all three have gone wrong in a real
 * invoicing system before:
 *
 *   Page size. A PDF that comes out at US Letter looks fine on screen and
 *   prints with a shifted margin on every A4 printer in Singapore. A4 is
 *   595.28 × 841.89 points, and every page has to be that, not just the first.
 *
 *   Embedded fonts. If Outfit and DM Sans are referenced but not embedded, the
 *   document renders in whatever the reader substitutes — which is the exact
 *   failure the local font packages exist to prevent. An embedded subset shows
 *   up as a FontFile2 (or FontFile3) on the descriptor.
 *
 *   Page count. Whether "Page 1 of 2" was telling the truth.
 *
 * The parser here is deliberately shallow. It inflates every stream in the
 * file and searches the result, rather than resolving the cross-reference
 * table properly. That is enough to answer these three questions and not much
 * else, which is the intent — this is a check, not a PDF library.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { inflateSync } from "node:zlib";

import { paths } from "../backend/src/paths.mjs";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const TOLERANCE_PT = 1;

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const all = args.includes("--all");
const targets = args.filter((arg) => !arg.startsWith("--"));

let files;
if (all || targets.length === 0) {
  const entries = await readdir(paths.outputs).catch(() => []);
  files = entries.filter((name) => name.endsWith(".pdf")).map((name) => join(paths.outputs, name));
} else {
  files = targets.map((target) => (target.endsWith(".pdf") ? target : join(paths.outputs, `${target}.pdf`)));
}

if (files.length === 0) {
  console.error(`No PDFs in ${paths.outputs}. Run \`npm run export -- --all\` first.`);
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const report = await inspect(file);
  const problems = [];

  if (report.pageCount === 0) problems.push("no pages found");

  const wrongSize = report.mediaBoxes.filter(
    ([, , width, height]) =>
      Math.abs(width - A4_WIDTH_PT) > TOLERANCE_PT || Math.abs(height - A4_HEIGHT_PT) > TOLERANCE_PT
  );
  if (wrongSize.length > 0) {
    problems.push(`${wrongSize.length} page(s) not A4: ${wrongSize.map((b) => `${b[2]}×${b[3]}pt`).join(", ")}`);
  }

  if (report.embeddedFonts === 0) problems.push("no embedded font programs");
  for (const family of ["Outfit", "DMSans", "IBMPlexMono"]) {
    if (report.usesFamily(family) && !report.hasFamily(family)) {
      problems.push(`${family} is referenced but not embedded`);
    }
  }

  const status = problems.length === 0 ? "ok  " : "FAIL";
  console.log(
    `${status} ${basename(file).padEnd(26)} ${report.pageCount} page(s)  ` +
      `${report.mediaBoxes[0] ? `${round(report.mediaBoxes[0][2])}×${round(report.mediaBoxes[0][3])}pt` : "?"}  ` +
      `fonts: ${[...report.embeddedFamilies].join(", ") || "none"}`
  );
  for (const problem of problems) console.log(`     ${problem}`);
  if (problems.length > 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} failed.`);
  process.exit(1);
}
console.log(`\n${files.length} PDF(s) checked. A4 on every page, fonts embedded.`);

async function inspect(file) {
  const raw = await readFile(file);
  const text = raw.toString("latin1");
  const inflated = inflateAll(raw);
  const haystack = text + "\n" + inflated;

  const mediaBoxes = [];
  const boxPattern = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
  let match;
  while ((match = boxPattern.exec(haystack)) !== null) {
    mediaBoxes.push(match.slice(1).map(Number));
  }

  // /Count on the page tree is the page count; take the largest, which is the
  // root of the tree rather than one of its branches.
  const counts = [...haystack.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const pageCount = counts.length > 0 ? Math.max(...counts) : mediaBoxes.length;

  const baseFonts = new Set([...haystack.matchAll(/\/BaseFont\s*\/([#\w+.-]+)/g)].map((m) => m[1]));
  const embeddedFonts = (haystack.match(/\/FontFile[23]?\b/g) ?? []).length;

  // Chrome writes each embedded subset as "ABCDEF+OutfitThin-SemiBold": a
  // six-letter subset tag, the font's own name, then the style. A family that
  // shows up as a bare /BaseFont with no subset tag is being substituted by
  // the reader rather than embedded.
  //
  // The names come from the font files themselves, so they are not the CSS
  // family names — Fontsource's Outfit files are all named "OutfitThin"
  // whatever weight they carry. Match on the prefix and read the weight from
  // the style suffix.
  const embeddedFamilies = new Set();
  for (const font of baseFonts) {
    if (!/^[A-Z]{6}\+/.test(font)) continue;
    embeddedFamilies.add(font.replace(/^[A-Z]{6}\+/, "").replace(/#20/g, ""));
  }
  const hasFamily = (family) => [...embeddedFamilies].some((name) => name.startsWith(family));

  return {
    pageCount,
    mediaBoxes: mediaBoxes.length > 0 ? mediaBoxes : [],
    baseFonts,
    embeddedFonts,
    embeddedFamilies,
    hasFamily,
    usesFamily: (family) => [...baseFonts].some((f) => f.replace(/^[A-Z]{6}\+/, "").startsWith(family)),
  };
}

/** Inflate every deflate stream in the file, ignoring the ones that are not. */
function inflateAll(buffer) {
  const parts = [];
  const marker = Buffer.from("stream");
  let index = buffer.indexOf(marker);

  while (index !== -1) {
    let start = index + marker.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;
    const end = buffer.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      parts.push(inflateSync(buffer.subarray(start, end)).toString("latin1"));
    } catch {
      // Not a deflate stream — an image, or a font program. Skip it.
    }
    index = buffer.indexOf(marker, end);
  }

  return parts.join("\n");
}

function round(value) {
  return Math.round(value * 100) / 100;
}
