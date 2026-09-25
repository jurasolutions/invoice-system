/**
 * One-off: move the records from the old JSON files into Postgres.
 *
 *   npm run migrate:json -- --dry-run      do it all, verify it, roll it back
 *   npm run migrate:json                   do it for real
 *   npm run migrate:json -- --from <dir>   read a data tree somewhere else
 *
 * Against DATABASE_URL, or the local PGlite database when it is not set. To
 * point it at Supabase from your machine:
 *
 *   node --env-file=.env backend/scripts/migrate-json.mjs --dry-run
 *
 * Everything happens in one transaction, counters last, and is checked before
 * it commits: every document present with an identical number, every counter
 * equal to the source, and no counter behind a number already in use. Any
 * mismatch rolls the whole lot back.
 *
 * Refuses a database that already has documents or counters in it. Merging two
 * number sequences is not something to do by script.
 *
 * The JSON files are only read. Delete them yourself once you have checked the
 * app against the database.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { closeDatabase, describeDatabase, query, transaction } from "../src/db.mjs";
import { ensureDatabase, readCounters, writeClientRow, writeDocument, writeTemplateRow } from "../src/store.mjs";
import { legacyDataRoot } from "../src/paths.mjs";
import { emptyCounters, parseNumber, validateCounters } from "@jura/shared/numbering.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const from = args.includes("--from") ? resolve(args[args.indexOf("--from") + 1]) : legacyDataRoot;

class DryRun extends Error {}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`${path}: ${error.message}`);
  }
}

async function readFolder(dir) {
  const files = await readdir(dir).catch(() => []);
  const out = [];
  for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
    out.push({ name: file.replace(/\.json$/, ""), value: await readJson(join(dir, file)) });
  }
  return out;
}

try {
  console.log(`From:  ${from}`);
  console.log(`To:    ${await describeDatabase()}`);
  console.log(dryRun ? "Mode:  dry run — everything is rolled back at the end\n" : "Mode:  for real\n");

  // ---- read and check the source before touching anything ---------------
  const config = await readJson(join(from, "config.json"), null);
  const clients = await readJson(join(from, "clients.json"), []);
  const counters = await readJson(join(from, "counters.json"), emptyCounters());
  const templates = await readFolder(join(from, "templates"));
  const documents = (await readFolder(join(from, "documents"))).map((f) => f.value);

  const counterProblems = validateCounters(counters);
  if (counterProblems.length) throw new Error(`counters.json is not usable: ${counterProblems.join("; ")}`);
  if (!config) throw new Error(`No config.json in ${from}. Is that the right folder?`);

  // No counter may sit behind a number that is already on a document, or the
  // next issue would collide with it.
  for (const doc of documents) {
    if (!doc.number) continue;
    const parsed = parseNumber(doc.number);
    if (!parsed) throw new Error(`${doc.id} has a number that does not parse: ${doc.number}`);
    const seq = counters[parsed.type]?.[parsed.period] ?? 0;
    if (seq < parsed.seq) {
      throw new Error(`${doc.number} is on a document, but counters.json has ${parsed.type} ${parsed.period} at ${seq}.`);
    }
  }

  console.log(
    `Source: settings, ${clients.length} client(s), ${templates.length} template(s), ` +
      `${documents.length} document(s), ${Object.values(counters).reduce((n, p) => n + Object.keys(p).length, 0)} counter(s)\n`
  );

  await ensureDatabase({ log: (line) => console.log(`  ${line}`) });

  const [{ docs }] = await query("select count(*)::int as docs from documents");
  const [{ ctrs }] = await query("select count(*)::int as ctrs from counters");
  if (docs > 0 || ctrs > 0) {
    throw new Error(
      `The database already has ${docs} document(s) and ${ctrs} counter(s). ` +
        "Refusing to merge two sets of records; migrate into an empty database."
    );
  }

  // ---- write, verify, commit ------------------------------------------------
  try {
    await transaction(async (q) => {
      await q(
        `insert into settings (id, config) values (1, $1::jsonb)
         on conflict (id) do update set config = excluded.config, updated_at = now()`,
        [JSON.stringify(config)]
      );

      for (const client of clients) await writeClientRow(client, q);

      // The shipped templates the boot wrote are replaced by the ones in use.
      await q("delete from templates");
      for (const { name, value } of templates) await writeTemplateRow(name, value, q);

      for (const doc of documents) await writeDocument(doc, q);

      for (const [type, periods] of Object.entries(counters)) {
        for (const [period, seq] of Object.entries(periods)) {
          if (seq > 0) await q("insert into counters (doc_type, period, seq) values ($1, $2, $3)", [type, period, seq]);
        }
      }

      // ---- verify, inside the transaction ---------------------------------
      const problems = [];
      const rows = await q("select id, number, data from documents");
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const doc of documents) {
        const row = byId.get(doc.id);
        if (!row) problems.push(`${doc.id} is missing`);
        else if ((row.number ?? null) !== (doc.number ?? null)) problems.push(`${doc.id}: number ${row.number} ≠ ${doc.number}`);
        else if (JSON.stringify(row.data) !== JSON.stringify(doc) && !sameJson(row.data, doc)) {
          problems.push(`${doc.id}: content differs after the round trip`);
        }
      }
      if (rows.length !== documents.length) problems.push(`${rows.length} documents written, ${documents.length} in the source`);

      const written = await readCounters(q);
      for (const [type, periods] of Object.entries(counters)) {
        for (const [period, seq] of Object.entries(periods)) {
          if (seq > 0 && written[type]?.[period] !== seq) {
            problems.push(`counter ${type} ${period}: ${written[type]?.[period]} ≠ ${seq}`);
          }
        }
      }

      const [{ c }] = await q("select count(*)::int as c from clients");
      if (c !== clients.length) problems.push(`${c} clients written, ${clients.length} in the source`);
      const [{ t }] = await q("select count(*)::int as t from templates");
      if (t !== templates.length) problems.push(`${t} templates written, ${templates.length} in the source`);

      if (problems.length) throw new Error(`Verification failed, nothing kept:\n  ${problems.join("\n  ")}`);

      console.log("Verified:");
      console.log(`  ${documents.length} document(s), every number identical`);
      for (const doc of documents.filter((d) => d.number)) console.log(`    ${doc.number}  ${doc.id}`);
      console.log(`  counters: ${JSON.stringify(written)}`);
      console.log(`  ${clients.length} client(s), ${templates.length} template(s), settings`);

      if (dryRun) throw new DryRun();
    });
    console.log("\nCommitted. The JSON files were only read — delete them once you have checked the app.");
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    console.log("\nDry run: rolled back. Run without --dry-run to keep it.");
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

/** Key order is not preserved by jsonb, so compare structurally. */
function sameJson(a, b) {
  const norm = (v) =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]))
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(JSON.parse(JSON.stringify(b))));
}
