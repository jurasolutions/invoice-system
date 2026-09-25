/**
 * Schema migrations.
 *
 *   npm run migrate                   apply anything pending
 *   npm run migrate -- --status       list applied and pending, change nothing
 *   npm run migrate -- --down 0001_initial
 *                                     undo the latest migration, which must be
 *                                     the one named — it can drop every record
 *
 * Against DATABASE_URL, or the local PGlite database when it is not set. The
 * server also applies pending migrations on boot, so this is mostly for seeing
 * what state a database is in, or preparing one before the first deploy.
 *
 * Migrations are `backend/migrations/NNNN_name.up.sql` with a matching
 * `.down.sql`, applied in order, each in one transaction.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { closeDatabase, describeDatabase, migrate, query, rollbackLast, schema } from "../src/db.mjs";

const args = process.argv.slice(2);

try {
  console.log(`Database: ${await describeDatabase()}\n`);

  if (args.includes("--status")) {
    const files = (await readdir(fileURLToPath(new URL("../migrations", import.meta.url))))
      .filter((f) => f.endsWith(".up.sql"))
      .map((f) => f.replace(/\.up\.sql$/, ""))
      .sort();
    const applied = new Set(
      (
        await query(`select version from "${schema}".schema_migrations`).catch(() => [])
      ).map((r) => r.version)
    );
    for (const version of files) console.log(`  ${applied.has(version) ? "applied" : "pending"}  ${version}`);
  } else if (args.includes("--down")) {
    const named = args[args.indexOf("--down") + 1];
    const [latest] = await query(`select version from "${schema}".schema_migrations order by version desc limit 1`);
    if (!latest) {
      console.log("Nothing to roll back.");
    } else if (named !== latest.version) {
      console.error(`Refusing: the latest migration is ${latest.version}. Name it exactly to roll it back:`);
      console.error(`  npm run migrate -- --down ${latest.version}`);
      process.exitCode = 1;
    } else {
      await rollbackLast();
    }
  } else {
    const applied = await migrate();
    console.log(applied.length ? `\nApplied ${applied.length}.` : "Up to date.");
  }
} finally {
  await closeDatabase();
}
