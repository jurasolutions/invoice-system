/**
 * Authentication.
 *
 * Users live in the `users` table, each with a scrypt hash of their password.
 * A signed-in user gets a signed token in an HttpOnly cookie. No session
 * store, because there is nothing to store: the token carries the username and
 * an expiry, and an HMAC over both proves the server issued it.
 *
 * ## Creating the admin
 *
 *   npm run create-admin -- admin 'a long passphrase'
 *
 * against the database in DATABASE_URL. Or set ADMIN_PASSWORD_HASH (from
 * `npm run hash-password`) in the environment, and the first boot on an empty
 * users table creates the admin from it.
 *
 * ## The default credentials
 *
 * With no users at all, local development accepts `admin` / `P@ssw0rd`, so the
 * app works the moment you clone it. That default is in this file, which means
 * it is on GitHub. Treat it as public, because it is. It is never accepted in
 * production, and the server **refuses to start in production** with no users
 * — see `ensureAdminUser()`.
 *
 * ## Why scrypt
 *
 * It is in Node's standard library, it is memory-hard, and it needs no
 * dependency. Passwords are never stored or compared in plaintext, and the
 * comparison is constant-time so it cannot be probed a character at a time.
 */
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

import { query } from "./db.mjs";

const scryptAsync = promisify(scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const SESSION_COOKIE = "jura_session";

/** The development default. Public, and refused in production. */
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "P@ssw0rd";

// ------------------------------------------------------------------ hashing

/** `scrypt$N$r$p$<salt hex>$<hash hex>` — self-describing, so the parameters
 *  can change later without invalidating existing hashes. */
export async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, saltHex, hashHex] = parts;
  let derived;
  try {
    derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), Buffer.from(hashHex, "hex").length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// -------------------------------------------------------------------- users

let cachedDefaultHash = null;

/**
 * The development default's hash. Derived rather than embedded, so there is no
 * hash in the repo that could be mistaken for a real one. Also the decoy for an
 * unknown username, so every refusal costs the same scrypt.
 */
async function defaultHash() {
  cachedDefaultHash ??= await hashPassword(DEFAULT_PASSWORD);
  return cachedDefaultHash;
}

/** The admin's username, for tools that mint their own session. */
export function username() {
  return process.env.ADMIN_USERNAME || DEFAULT_USERNAME;
}

export function validUsername(name) {
  return typeof name === "string" && /^[A-Za-z0-9._@-]{1,80}$/.test(name);
}

async function countUsers() {
  const [{ count }] = await query("select count(*)::int as count from users");
  return count;
}

/** Create a user, or reset their password if they exist. */
export async function setUserPassword(name, password) {
  await setUserPasswordHash(name, await hashPassword(password));
}

export async function setUserPasswordHash(name, hash) {
  if (!validUsername(name)) throw new Error(`"${name}" is not a usable username.`);
  if (!String(hash).startsWith("scrypt$")) throw new Error("That is not a hash from `npm run hash-password`.");
  await query(
    `insert into users (username, password_hash) values ($1, $2)
     on conflict (username) do update set password_hash = excluded.password_hash, updated_at = now()`,
    [name, hash]
  );
}

/**
 * Called on boot, after the migrations.
 *
 * An empty users table plus ADMIN_PASSWORD_HASH creates the admin from it, so
 * a Railway deploy can be set up entirely from its variables. An empty users
 * table in production with nothing to create one from refuses to start: there
 * would be no way in, and the development default must never be the way in.
 */
export async function ensureAdminUser() {
  if ((await countUsers()) > 0) return;

  if (process.env.ADMIN_PASSWORD_HASH) {
    await setUserPasswordHash(username(), process.env.ADMIN_PASSWORD_HASH);
    console.log(`[jura] no users - created "${username()}" from ADMIN_PASSWORD_HASH.`);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "\nRefusing to start: there are no users, so nobody could sign in.\n\n" +
        "  Either run `npm run create-admin -- admin 'your password'` against this database,\n" +
        "  or set ADMIN_PASSWORD_HASH (from `npm run hash-password`) and redeploy.\n"
    );
    process.exit(1);
  }
}

/**
 * The secret the session tokens are signed with.
 *
 * In production it must be set, or every restart would invalidate every session
 * and — worse — a predictable secret would let anyone mint their own token. In
 * development it is random per boot, so restarting the server signs you out.
 */
let devSecret = null;
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

/**
 * Refuse to start a public server with the credentials that are printed in this
 * file and published on GitHub. Called from server.mjs before it listens.
 */
export function assertProductionReady() {
  if (process.env.NODE_ENV !== "production") return;

  const problems = [];
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set. The records live in Postgres; set it to the Supabase connection string.");
  }
  if (!process.env.SESSION_SECRET) {
    problems.push(
      "SESSION_SECRET is not set. Session tokens would be signed with a key that changes " +
        "on every restart. Set it to 32+ random bytes."
    );
  }
  if (problems.length > 0) {
    console.error("\nRefusing to start:\n");
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
  }
}

// ----------------------------------------------------------------- sessions

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

export function createSession(user, now = Date.now()) {
  const payload = b64url(JSON.stringify({ u: user, exp: now + SESSION_TTL_MS }));
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** The session a token represents, or null if it is forged, tampered with or expired. */
export function readSession(token, now = Date.now()) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".", 2);

  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const a = Buffer.from(signature ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims?.u || typeof claims.exp !== "number" || claims.exp < now) return null;
  return { user: claims.u, expires_at: claims.exp };
}

/**
 * Check a username and password. Returns the username, or null.
 *
 * Always does the hash work, so an unknown username and a wrong password take
 * the same time to reject and a caller cannot tell which it was.
 */
export async function authenticate(user, password) {
  const name = String(user ?? "");
  const secret = String(password ?? "");

  if (await usingDefaultCredentials()) {
    const ok = await verifyPassword(secret, await defaultHash());
    return ok && name === DEFAULT_USERNAME ? name : null;
  }

  const [row] = validUsername(name)
    ? await query("select username, password_hash from users where username = $1", [name])
    : [];
  const ok = await verifyPassword(secret, row?.password_hash ?? (await defaultHash()));
  if (!row || !ok) return null;

  await query("update users set last_login_at = now() where username = $1", [row.username]).catch(() => {});
  return row.username;
}

/**
 * True when there are no users and this is not production, so the published
 * default password is what lets people in.
 */
export async function usingDefaultCredentials() {
  if (process.env.NODE_ENV === "production") return false;
  return (await countUsers()) === 0;
}

// ------------------------------------------------------------------ cookies

export function parseCookies(header) {
  const jar = {};
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

/**
 * The Set-Cookie for a session.
 *
 * Hosted, the frontend is on Cloudflare Pages and the API is on Railway —
 * different sites — so the cookie needs `SameSite=None; Secure` to be sent at
 * all. Locally the Vite proxy makes them the same origin, where `Lax` is right
 * and `Secure` would stop the cookie working over plain http.
 */
export function sessionCookie(token, { maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  const crossSite = process.env.NODE_ENV === "production" || process.env.COOKIE_CROSS_SITE === "true";
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
    crossSite ? "SameSite=None" : "SameSite=Lax",
  ];
  if (crossSite) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearedCookie() {
  return sessionCookie("", { maxAgeSeconds: 0 });
}

/** The session on a request — cookie first, then a bearer token for scripts. */
export function sessionFromRequest(req) {
  const fromCookie = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
  if (fromCookie) {
    const session = readSession(fromCookie);
    if (session) return session;
  }
  const auth = req.headers?.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return readSession(auth.slice(7));
  }
  return null;
}
