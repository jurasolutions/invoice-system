/**
 * Creates the data tree.
 *
 *   npm run seed                      config, counters, clients, templates
 *   npm run seed -- --with-specimen   and the three documents from the concept
 *   npm run seed -- --force           overwrite an existing config.json
 *
 * Refuses to overwrite anything by default. A `counters.json` that gets reset
 * hands out invoice numbers that have already been used, which is the one
 * failure this system exists to prevent.
 */
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { paths, dataRoot, outputRoot } from "../server/paths.mjs";
import { writeJsonAtomic } from "../server/atomic.mjs";
import { emptyCounters } from "../src/domain/numbering.js";
import { defaultConfig } from "./seed-config.mjs";
import { seedTemplates } from "./seed-templates.mjs";
import { specimenClient, specimenDocuments } from "./seed-specimen.mjs";

const args = process.argv.slice(2);
const withSpecimen = args.includes("--with-specimen");
const force = args.includes("--force");

const created = [];
const skipped = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeIfAbsent(path, value, label) {
  if (!force && (await exists(path))) {
    skipped.push(label);
    return false;
  }
  await writeJsonAtomic(path, value);
  created.push(label);
  return true;
}

await mkdir(paths.documents, { recursive: true });
await mkdir(paths.templates, { recursive: true });
await mkdir(paths.outputs, { recursive: true });

await writeIfAbsent(paths.config, defaultConfig(), "config.json");

for (const template of seedTemplates) {
  const { slug, ...rest } = template;
  await writeIfAbsent(join(paths.templates, `${slug}.json`), { ...rest, updated_at: new Date().toISOString() }, `templates/${slug}.json`);
}

if (withSpecimen) {
  const { documents, counters } = specimenDocuments();

  await writeIfAbsent(paths.clients, [specimenClient], "clients.json");
  for (const doc of documents) {
    await writeIfAbsent(join(paths.documents, `${doc.id}.json`), doc, `documents/${doc.id}.json`);
  }

  // The specimen documents already carry numbers, so the counters have to
  // start above them. Merging rather than replacing, in case a real sequence
  // is already running in some other month.
  const existing = (await exists(paths.counters)) && !force ? JSON.parse(await readText(paths.counters)) : emptyCounters();
  const merged = { ...emptyCounters(), ...existing };
  for (const [type, periods] of Object.entries(counters)) {
    merged[type] = { ...(merged[type] ?? {}) };
    for (const [period, seq] of Object.entries(periods)) {
      merged[type][period] = Math.max(merged[type][period] ?? 0, seq);
    }
  }
  await writeJsonAtomic(paths.counters, merged);
  created.push("counters.json (advanced past the specimen numbers)");
} else {
  await writeIfAbsent(paths.clients, [], "clients.json");
  await writeIfAbsent(paths.counters, emptyCounters(), "counters.json");
}

async function readText(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

console.log(`Data tree:   ${dataRoot}`);
console.log(`PDF output:  ${outputRoot}`);
if (created.length) console.log(`\nCreated:\n  ${created.join("\n  ")}`);
if (skipped.length) console.log(`\nLeft alone (already there):\n  ${skipped.join("\n  ")}`);
if (skipped.includes("config.json") && !force) {
  console.log("\nPass --force to overwrite config.json. counters.json is never overwritten without it.");
}
if (!withSpecimen) {
  console.log("\nPass --with-specimen for the three documents from the concept design.");
}
console.log("\nCompany and payment details in config.json are placeholders. The app will");
console.log("refuse to issue a document until you replace them and set the _confirmed flags.");
