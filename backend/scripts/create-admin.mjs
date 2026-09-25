/**
 * Create a user who can sign in, or reset an existing user's password.
 *
 *   npm run create-admin -- admin 'a long passphrase'
 *
 * Against DATABASE_URL, or the local PGlite database when it is not set. To
 * point it at Supabase from your machine:
 *
 *   node --env-file=.env backend/scripts/create-admin.mjs admin 'a long passphrase'
 *
 * Quote the password. An unquoted `P@ssw0rd!` will be mangled by your shell.
 * Only the scrypt hash is stored; the password is not logged anywhere.
 */
import { closeDatabase, describeDatabase } from "../src/db.mjs";
import { ensureDatabase } from "../src/store.mjs";
import { setUserPassword, validUsername } from "../src/auth.mjs";

const [name, ...rest] = process.argv.slice(2);
const password = rest.join(" ");

if (!name || !password) {
  console.error("Usage: npm run create-admin -- <username> '<password>'");
  process.exit(1);
}
if (!validUsername(name)) {
  console.error(`"${name}" is not a usable username: letters, digits and . _ @ - only.`);
  process.exit(1);
}
if (password.length < 12) {
  console.error(
    `That password is ${password.length} characters. This one guards client billing\n` +
      "data on the public internet — use at least 12, or a passphrase."
  );
  process.exit(1);
}

try {
  await ensureDatabase({ log: null });
  await setUserPassword(name, password);
  console.log(`"${name}" can now sign in. (${await describeDatabase()})`);
} finally {
  await closeDatabase();
}
