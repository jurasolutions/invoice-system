/**
 * The numbering guarantees, proven against the real database.
 *
 *   node --env-file=.env tools/check-postgres.mjs
 *
 * The unit tests run on PGlite, which is one connection: transactions queue,
 * they never truly overlap. Here they do. Against DATABASE_URL, in a scratch
 * schema (`jura_check_<random>`) that is dropped at the end, so the real
 * records are never read or touched:
 *
 *   twenty concurrent issues get twenty distinct, gapless numbers
 *   the same document issued twice at once gets one number
 *   an issued document refuses an edit, from the store and from raw SQL
 *   a connection killed mid-issue leaves nothing half-written
 */
import { randomBytes } from "node:crypto";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env tools/check-postgres.mjs");
  process.exit(1);
}
process.env.JURA_DB_SCHEMA = `jura_check_${randomBytes(4).toString("hex")}`;

const { default: pg } = await import("pg");
const db = await import("../backend/src/db.mjs");
const store = await import("../backend/src/store.mjs");
const { defaultConfig } = await import("@jura/shared/defaults/config.js");

const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  ok    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

const CLIENT = { id: "cli_check", name: "Check Client Pte. Ltd.", address_lines: ["1 Test Road", "Singapore 100001"] };

async function readyDraft() {
  const doc = await store.createDocument({ type: "invoice", client_id: CLIENT.id });
  return store.saveDocument(doc.id, {
    issued_at: "2026-09-06",
    due_date: "2026-10-06",
    terms_days: 30,
    sections: [
      { id: "sec_1", title: "Work", meta: "", items: [{ id: "itm_1", description: "Work", note: "", qty: 1, unit_price_cents: 100000 }] },
    ],
  });
}

try {
  console.log(`\n${await db.describeDatabase()}`);
  await db.resetDatabase();
  await store.ensureDatabase({ log: null });
  const config = defaultConfig();
  config.company.uen = "202612345K";
  config.company.uen_confirmed = true;
  config.company.address_lines = ["1 Somewhere Road", "Singapore 100001"];
  config.company.address_confirmed = true;
  await store.writeConfig(config);
  await store.upsertClient(CLIENT);

  console.log("\nconcurrent issues");
  const drafts = await Promise.all(Array.from({ length: 20 }, () => readyDraft()));
  const issued = await Promise.all(drafts.map((d) => store.issueDocument(d.id)));
  const seqs = issued.map((d) => Number(d.number.slice(-3))).sort((a, b) => a - b);
  check("20 parallel issues → 20 distinct numbers", new Set(seqs).size === 20, seqs.join(","));
  check("no gaps: 001 to 020", seqs.every((n, i) => n === i + 1), seqs.join(","));
  const counters = await store.readCounters();
  check("the counter reads 20", counters.invoice["2026-09"] === 20, JSON.stringify(counters.invoice));

  const twice = await readyDraft();
  const results = await Promise.allSettled([store.issueDocument(twice.id), store.issueDocument(twice.id)]);
  check("one document issued twice at once gets one number", results.filter((r) => r.status === "fulfilled").length === 1);
  check("and the counter moved once", (await store.readCounters()).invoice["2026-09"] === 21);

  console.log("\nimmutability");
  const target = issued[0];
  const viaStore = await store.saveDocument(target.id, { reference: "changed" }).then(() => null, (e) => e);
  check("the store refuses an edit to an issued document", /cannot be changed/.test(viaStore?.message ?? ""));
  const viaSql = await db
    .query(`update documents set data = jsonb_set(data, '{reference}', '"changed"') where id = $1`, [target.id])
    .then(() => null, (e) => e);
  check("the database refuses the same edit in raw SQL", /cannot be changed/.test(viaSql?.message ?? ""), viaSql?.message);
  const del = await db.query("delete from documents where id = $1", [target.id]).then(() => null, (e) => e);
  check("the database refuses to delete it", /cannot be deleted/.test(del?.message ?? ""), del?.message);

  console.log("\na connection killed mid-issue");
  const t = db.parseDatabaseUrl(process.env.DATABASE_URL);
  const victim = new pg.Client({ ...t, ssl: { rejectUnauthorized: false } });
  victim.on("error", () => {});
  await victim.connect();
  await victim.query(`set search_path to "${db.schema}"`);
  const [{ pid }] = (await victim.query("select pg_backend_pid() as pid")).rows;
  await victim.query("begin");
  await victim.query(
    `insert into counters (doc_type, period, seq) values ('invoice', '2026-09', 1)
     on conflict (doc_type, period) do update set seq = counters.seq + 1`
  );
  // The counter row is now locked and advanced, uncommitted. Kill it.
  await db.query("select pg_terminate_backend($1)", [pid]);
  await victim.end().catch(() => {});
  check("the killed transaction's counter bump did not survive", (await store.readCounters()).invoice["2026-09"] === 21);
  const after = await store.issueDocument((await readyDraft()).id);
  check("the next issue continues the sequence with no gap", after.number === "JURA-2026-09-022", after.number);
} catch (error) {
  console.error(error);
  failures.push(error.message);
} finally {
  await db.dropScratchSchema().catch((e) => console.error(`Could not drop ${db.schema}: ${e.message}`));
  await db.closeDatabase();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nThe numbering holds against the real database. (${process.env.JURA_DB_SCHEMA} dropped.)`);
