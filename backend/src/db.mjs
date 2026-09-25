/**
 * The database.
 *
 * Two drivers behind one small interface — `query(sql, params)` and
 * `transaction(fn)` — so the store is written once:
 *
 *   DATABASE_URL set   Postgres over the network. Supabase, hosted.
 *   not set            PGlite: real Postgres compiled to WebAssembly, running
 *                      in this process. Local development and the tests. Same
 *                      SQL, same constraints, same triggers, no server to run.
 *
 * Production refuses to start without DATABASE_URL, so a Railway deploy can
 * never quietly fall back to a database that lives on its throwaway disk.
 *
 * Every table lives in one schema (JURA_DB_SCHEMA, default `jura`) rather than
 * `public`, and each connection's search_path points at it. That keeps the
 * records out of Supabase's REST API, and lets a check run in a scratch schema
 * of the real database without touching the real records.
 */
import { readdir, readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { localDatabasePath } from "./paths.mjs";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export const schema = process.env.JURA_DB_SCHEMA || "jura";
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
  throw new Error(`JURA_DB_SCHEMA must be a plain lower-case identifier, not "${schema}".`);
}

let driverPromise = null;

function driver() {
  driverPromise ??= connect();
  return driverPromise;
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) return connectPostgres(url);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Refusing to start in production without the real database — " +
        "records written anywhere else would be lost on the next deploy."
    );
  }
  return connectPglite(localDatabasePath);
}

async function connectPostgres(url) {
  const { default: pg } = await import("pg");
  const target = parseDatabaseUrl(url);
  const ssl = target.sslmode === "disable" || process.env.DATABASE_SSL === "disable"
    ? false
    // Supabase signs its certificates with its own CA, not a public one.
    // The connection is still encrypted; it just does not pin the issuer.
    : { rejectUnauthorized: false };

  const pool = new pg.Pool({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => console.error("[jura-db] idle connection error:", error.message));

  // Every connection has its search_path set before its first use, so no
  // query ever runs against the wrong schema.
  const ready = new WeakSet();
  async function checkout() {
    const client = await pool.connect();
    if (!ready.has(client)) {
      try {
        await client.query(`set search_path to "${schema}"`);
      } catch (error) {
        client.release(error);
        throw error;
      }
      ready.add(client);
    }
    return client;
  }
  async function once(sql, params) {
    const client = await checkout();
    try {
      return (await client.query(sql, params)).rows;
    } finally {
      client.release();
    }
  }

  return {
    kind: "postgres",
    describe: `Postgres at ${target.host}, schema ${schema}`,
    query: (sql, params) => once(sql, params),
    exec: async (sql) => {
      await once(sql);
    },
    async transaction(fn) {
      const client = await checkout();
      try {
        await client.query("begin");
        const q = async (sql, params = []) => (await client.query(sql, params)).rows;
        q.exec = async (sql) => {
          await client.query(sql);
        };
        const result = await fn(q);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function connectPglite(path) {
  const { PGlite } = await import("@electric-sql/pglite");
  const memory = path.startsWith("memory://");
  if (!memory) await mkdir(path, { recursive: true });
  const db = new PGlite(path);
  await db.waitReady;
  await db.exec(`create schema if not exists "${schema}"; set search_path to "${schema}";`);

  return {
    kind: "pglite",
    describe: memory ? `PGlite (in memory), schema ${schema}` : `PGlite at ${path}, schema ${schema}`,
    memory,
    query: async (sql, params) => (await db.query(sql, params)).rows,
    exec: async (sql) => {
      await db.exec(sql);
    },
    // PGlite is one connection, so it runs one transaction at a time and queues
    // everything else behind it. Code inside `fn` must use the `q` it is given,
    // never the module-level `query`, or it waits on itself forever.
    transaction: (fn) =>
      db.transaction((tx) => {
        const q = async (sql, params = []) => (await tx.query(sql, params)).rows;
        q.exec = async (sql) => {
          await tx.exec(sql);
        };
        return fn(q);
      }),
    close: () => db.close(),
  };
}

/**
 * Take a connection string apart without trusting it to be URL-encoded.
 *
 * Supabase shows the password raw, and a password with `@`, `#` or `&` in it
 * breaks `new URL()`. The host is everything after the *last* `@`, and the
 * password is everything between the first `:` and that `@`.
 */
export function parseDatabaseUrl(url) {
  const match = /^postgres(?:ql)?:\/\/([^:@/]+)(?::(.*))?@([^@/?]+)\/([^?]*)(?:\?(.*))?$/s.exec(String(url).trim());
  if (!match) throw new Error("DATABASE_URL is not a postgres:// connection string.");
  const [, user, password = "", hostPort, database, query = ""] = match;
  const [host, port = "5432"] = hostPort.split(":");
  const params = new URLSearchParams(query);
  return {
    user: maybeDecode(user),
    password: maybeDecode(password),
    host,
    port: Number(port),
    database: database || "postgres",
    sslmode: params.get("sslmode"),
  };
}

function maybeDecode(text) {
  // Encoded strings cannot contain these raw; if they are there, it was not encoded.
  if (/[@#?/ ]/.test(text) || !text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// ------------------------------------------------------------------ queries

export async function query(sql, params = []) {
  return (await driver()).query(sql, params);
}

export async function transaction(fn) {
  return (await driver()).transaction(fn);
}

export async function describeDatabase() {
  return (await driver()).describe;
}

export async function closeDatabase() {
  if (!driverPromise) return;
  const d = await driverPromise;
  driverPromise = null;
  await d.close();
}

// --------------------------------------------------------------- migrations

async function migrationFiles() {
  const files = await readdir(migrationsDir);
  return files
    .filter((f) => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(f))
    .sort()
    .map((file) => ({ version: file.replace(/\.up\.sql$/, ""), file }));
}

/**
 * Bring the schema up to date. Safe to call on every boot.
 *
 * Each migration runs in its own transaction with its bookkeeping row, so a
 * migration that fails halfway leaves nothing behind. An advisory lock keeps
 * two instances booting at once from applying the same one twice.
 */
export async function migrate({ log = console.log } = {}) {
  const d = await driver();
  await d.exec(`create schema if not exists "${schema}"`);
  await lockDownSchema(d);
  await d.query(
    `create table if not exists "${schema}".schema_migrations (
       version text primary key,
       applied_at timestamptz not null default now()
     )`
  );

  const applied = [];
  for (const { version, file } of await migrationFiles()) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    const ran = await d.transaction(async (q) => {
      await q(`select pg_advisory_xact_lock(hashtext($1))`, [`jura-migrate-${schema}`]);
      await q(`set local search_path to "${schema}"`);
      const done = await q(`select 1 from schema_migrations where version = $1`, [version]);
      if (done.length > 0) return false;
      // Multi-statement SQL has to go through the simple protocol.
      await q.exec(sql);
      await q(`insert into schema_migrations (version) values ($1)`, [version]);
      return true;
    });
    if (ran) {
      applied.push(version);
      log?.(`[jura-db] applied migration ${version}`);
    }
  }
  return applied;
}

/** Undo the most recent migration. Only the migrate script calls this. */
export async function rollbackLast({ log = console.log } = {}) {
  const d = await driver();
  const [last] = await d.query(`select version from "${schema}".schema_migrations order by version desc limit 1`);
  if (!last) return null;
  const sql = await readFile(join(migrationsDir, `${last.version}.down.sql`), "utf8");
  await d.transaction(async (q) => {
    await q(`set local search_path to "${schema}"`);
    await q.exec(sql);
    await q(`delete from schema_migrations where version = $1`, [last.version]);
  });
  log?.(`[jura-db] rolled back ${last.version}`);
  return last.version;
}

/**
 * On Supabase, make sure the API roles cannot see this schema at all. The
 * roles do not exist anywhere else, so this is skipped quietly there.
 */
async function lockDownSchema(d) {
  await d.exec(`
    do $$
    declare r text;
    begin
      foreach r in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = r) then
          execute format('revoke all on schema %I from %I', '${schema}', r);
          execute format('revoke all on all tables in schema %I from %I', '${schema}', r);
        end if;
      end loop;
    end $$;
  `);
}

/**
 * Drop and recreate the schema. For tests and checks only, and it refuses
 * anything but an in-memory database or a schema whose name says it is scratch.
 */
export async function resetDatabase() {
  const d = await driver();
  const scratch = d.memory || /^jura_(check|test)_/.test(schema);
  if (!scratch) throw new Error(`Refusing to reset "${schema}" on ${d.describe}: not a scratch database.`);
  await d.exec(`drop schema if exists "${schema}" cascade`);
  await migrate({ log: null });
}

/** Drop a scratch schema entirely. Same refusal as resetDatabase. */
export async function dropScratchSchema() {
  const d = await driver();
  if (!/^jura_(check|test)_/.test(schema)) throw new Error(`Refusing to drop "${schema}": not a scratch schema.`);
  await d.exec(`drop schema if exists "${schema}" cascade`);
}
