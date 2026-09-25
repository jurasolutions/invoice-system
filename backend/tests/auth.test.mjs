/**
 * Signing in against the users table.
 *
 * `npm run check:auth` covers the HTTP side — refusals, cookies, forged tokens
 * — on the development default. This covers what changes once a real user
 * exists: the default stops working, and only the stored hash lets anyone in.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";

delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD_HASH;
process.env.JURA_PGLITE_PATH = "memory://";

const auth = await import("../src/auth.mjs");
const { query, resetDatabase, closeDatabase } = await import("../src/db.mjs");

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe("with no users", () => {
  it("accepts the development default, and says so", async () => {
    expect(await auth.usingDefaultCredentials()).toBe(true);
    expect(await auth.authenticate("admin", "P@ssw0rd")).toBe("admin");
    expect(await auth.authenticate("admin", "wrong")).toBe(null);
  });

  it("never accepts the default in production", async () => {
    process.env.NODE_ENV = "production";
    try {
      expect(await auth.usingDefaultCredentials()).toBe(false);
      expect(await auth.authenticate("admin", "P@ssw0rd")).toBe(null);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });
});

describe("once a user exists", () => {
  it("accepts their password and nothing else", async () => {
    await auth.setUserPassword("tingyu", "a long enough passphrase");
    expect(await auth.usingDefaultCredentials()).toBe(false);

    expect(await auth.authenticate("tingyu", "a long enough passphrase")).toBe("tingyu");
    expect(await auth.authenticate("tingyu", "wrong")).toBe(null);
    expect(await auth.authenticate("nobody", "a long enough passphrase")).toBe(null);
    // The published default is dead the moment a real user exists.
    expect(await auth.authenticate("admin", "P@ssw0rd")).toBe(null);
  });

  it("stores a hash, never the password", async () => {
    await auth.setUserPassword("tingyu", "a long enough passphrase");
    const [row] = await query("select password_hash, last_login_at from users where username = 'tingyu'");
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain("passphrase");
  });

  it("resets a password in place", async () => {
    await auth.setUserPassword("tingyu", "the first passphrase");
    await auth.setUserPassword("tingyu", "the second passphrase");
    expect(await auth.authenticate("tingyu", "the first passphrase")).toBe(null);
    expect(await auth.authenticate("tingyu", "the second passphrase")).toBe("tingyu");
    const [{ count }] = await query("select count(*)::int as count from users");
    expect(count).toBe(1);
  });

  it("records when they last signed in", async () => {
    await auth.setUserPassword("tingyu", "a long enough passphrase");
    await auth.authenticate("tingyu", "a long enough passphrase");
    const [row] = await query("select last_login_at from users where username = 'tingyu'");
    expect(row.last_login_at).not.toBe(null);
  });
});

describe("ensureAdminUser", () => {
  it("creates the admin from ADMIN_PASSWORD_HASH on an empty table", async () => {
    process.env.ADMIN_PASSWORD_HASH = await auth.hashPassword("from the environment");
    try {
      await auth.ensureAdminUser();
      expect(await auth.authenticate("admin", "from the environment")).toBe("admin");
    } finally {
      delete process.env.ADMIN_PASSWORD_HASH;
    }
  });

  it("leaves an existing user alone", async () => {
    await auth.setUserPassword("tingyu", "a long enough passphrase");
    process.env.ADMIN_PASSWORD_HASH = await auth.hashPassword("from the environment");
    try {
      await auth.ensureAdminUser();
      const [{ count }] = await query("select count(*)::int as count from users");
      expect(count).toBe(1);
    } finally {
      delete process.env.ADMIN_PASSWORD_HASH;
    }
  });
});
