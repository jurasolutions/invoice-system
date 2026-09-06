/**
 * Where the data and the rendered PDFs live.
 *
 * State is deliberately kept outside this repo. Client names, addresses and
 * amounts are not things to push to GitHub, and the AI OS already has a home
 * for them at `jurasolutions/data/`. When this repo sits in its usual place
 * (`jurasolutions/repos/invoice-system`), the data root resolves to
 * `jurasolutions/data/invoices/` and rendered PDFs to
 * `jurasolutions/outputs/invoices/`.
 *
 * Checked out somewhere else, both fall back to folders inside the repo, which
 * `.gitignore` already excludes. Either way the resolved paths are printed when
 * the dev server starts, so there is never a question of where a document went.
 *
 * Override with JURA_DATA_PATH and JURA_OUTPUT_PATH.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, "..");

/** The `jurasolutions/` domain root, if this repo is checked out inside it. */
const domainRoot = resolve(repoRoot, "../..");
const insideDomain = existsSync(resolve(domainRoot, "CLAUDE.md")) && existsSync(resolve(domainRoot, "design-system"));

export const dataRoot = process.env.JURA_DATA_PATH
  ? resolve(process.env.JURA_DATA_PATH)
  : insideDomain
    ? resolve(domainRoot, "data/invoices")
    : resolve(repoRoot, "data/invoices");

export const outputRoot = process.env.JURA_OUTPUT_PATH
  ? resolve(process.env.JURA_OUTPUT_PATH)
  : insideDomain
    ? resolve(domainRoot, "outputs/invoices")
    : resolve(repoRoot, "outputs/invoices");

export const paths = {
  root: dataRoot,
  config: resolve(dataRoot, "config.json"),
  counters: resolve(dataRoot, "counters.json"),
  countersLock: resolve(dataRoot, "counters.lock"),
  clients: resolve(dataRoot, "clients.json"),
  templates: resolve(dataRoot, "templates"),
  documents: resolve(dataRoot, "documents"),
  outputs: outputRoot,
};

/** True when the data tree has been seeded. */
export function isSeeded() {
  return existsSync(paths.config) && existsSync(paths.counters) && existsSync(paths.documents);
}
