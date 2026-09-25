/**
 * Where things live on disk.
 *
 * The records are in Postgres now (see db.mjs). What is left on disk is:
 *
 *   - rendered PDFs, from `npm run export`
 *   - the local development database, when DATABASE_URL is not set
 *   - the old JSON data tree, read once by `npm run migrate:json`
 *
 * When this repo sits in its usual place (`jurasolutions/repos/invoice-system`)
 * those resolve under `jurasolutions/data/` and `jurasolutions/outputs/`, which
 * the AI OS already treats as machine-writable. Checked out anywhere else they
 * fall back to folders inside the repo, which `.gitignore` excludes.
 *
 * Override with JURA_OUTPUT_PATH, JURA_PGLITE_PATH and JURA_DATA_PATH.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** The repo root: this file is at <repo>/backend/src/paths.mjs. */
export const repoRoot = resolve(here, "../..");

/** The `jurasolutions/` domain root, if this repo is checked out inside it. */
const domainRoot = resolve(repoRoot, "../..");
const insideDomain = existsSync(resolve(domainRoot, "CLAUDE.md")) && existsSync(resolve(domainRoot, "design-system"));

const underDomain = (domainPath, repoPath) => (insideDomain ? resolve(domainRoot, domainPath) : resolve(repoRoot, repoPath));

export const outputRoot = process.env.JURA_OUTPUT_PATH
  ? resolve(process.env.JURA_OUTPUT_PATH)
  : underDomain("outputs/invoices", "outputs/invoices");

/** The PGlite directory for local development. `memory://` keeps it off disk. */
export const localDatabasePath = process.env.JURA_PGLITE_PATH?.startsWith("memory://")
  ? process.env.JURA_PGLITE_PATH
  : process.env.JURA_PGLITE_PATH
    ? resolve(process.env.JURA_PGLITE_PATH)
    : underDomain("data/invoices-db", "data/invoices-db");

/** The pre-Postgres JSON tree. Only the one-off migration reads it. */
export const legacyDataRoot = process.env.JURA_DATA_PATH
  ? resolve(process.env.JURA_DATA_PATH)
  : underDomain("data/invoices", "data/invoices");

export const paths = {
  outputs: outputRoot,
};
