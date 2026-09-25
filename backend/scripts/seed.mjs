/**
 * Prepares a database to work in.
 *
 *   npm run seed                      schema, default settings, templates
 *   npm run seed -- --with-specimen   and the three documents from the concept
 *   npm run seed -- --force           reset the settings to the shipped default
 *
 * Against DATABASE_URL, or the local PGlite database when it is not set.
 *
 * Refuses to overwrite anything by default. The counters are only ever moved
 * forward: a counter that goes backwards hands out invoice numbers that have
 * already been used, which is the one failure this system exists to prevent.
 */
import { closeDatabase, describeDatabase, query, transaction } from "../src/db.mjs";
import { ensureDatabase, writeClientRow, writeDocument, writeConfig } from "../src/store.mjs";
import { defaultConfig } from "@jura/shared/defaults/config.js";
import { specimenClient, specimenDocuments } from "@jura/shared/defaults/specimen.js";

const args = process.argv.slice(2);
const withSpecimen = args.includes("--with-specimen");
const force = args.includes("--force");

const created = [];
const skipped = [];

try {
  await ensureDatabase();

  if (force) {
    await writeConfig(defaultConfig());
    created.push("settings (reset to the default)");
  }

  if (withSpecimen) {
    const { documents, counters } = specimenDocuments();
    await transaction(async (q) => {
      const [client] = await q("select 1 from clients where id = $1", [specimenClient.id]);
      if (client) skipped.push(`client ${specimenClient.id}`);
      else {
        await writeClientRow(specimenClient, q);
        created.push(`client ${specimenClient.id}`);
      }

      for (const doc of documents) {
        const [existing] = await q("select 1 from documents where id = $1", [doc.id]);
        if (existing) {
          skipped.push(`document ${doc.id}`);
          continue;
        }
        await writeDocument(doc, q);
        created.push(`document ${doc.id}${doc.number ? ` (${doc.number})` : ""}`);
      }

      // The specimen documents already carry numbers, so the counters have to
      // sit at or above them. Only ever forwards.
      for (const [type, periods] of Object.entries(counters)) {
        for (const [period, seq] of Object.entries(periods)) {
          await q(
            `insert into counters (doc_type, period, seq) values ($1, $2, $3)
             on conflict (doc_type, period) do update set seq = greatest(counters.seq, excluded.seq)`,
            [type, period, seq]
          );
        }
      }
    });
    created.push("counters (advanced past the specimen numbers)");
  }

  console.log(`\nDatabase: ${await describeDatabase()}`);
  if (created.length) console.log(`\nCreated:\n  ${created.join("\n  ")}`);
  if (skipped.length) console.log(`\nLeft alone (already there):\n  ${skipped.join("\n  ")}`);
  if (!withSpecimen) console.log("\nPass --with-specimen for the three documents from the concept design.");

  const [{ count }] = await query("select count(*)::int as count from users");
  if (count === 0) console.log("\nNo users yet. Create one: npm run create-admin -- admin 'your password'");
  console.log("\nCompany and payment details are placeholders until set in Settings. The app");
  console.log("will refuse to issue a document until they are replaced and confirmed.");
} finally {
  await closeDatabase();
}
