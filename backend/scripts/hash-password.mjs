/**
 * Turn a password into the hash the server checks against.
 *
 *   npm run hash-password -- 'the new password'
 *
 * Put the output in `ADMIN_PASSWORD_HASH` in the Railway environment. The
 * password itself never goes anywhere — not into the repo, not into an env
 * var, not into a log.
 *
 * Quote the password. An unquoted `P@ssw0rd!` will be mangled by your shell,
 * and you will spend twenty minutes wondering why the login is refusing you.
 */
import { hashPassword } from "../src/auth.mjs";

const password = process.argv.slice(2).join(" ");

if (!password) {
  console.error("Usage: npm run hash-password -- 'your password'");
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `That password is ${password.length} characters. This one guards client billing\n` +
      "data on the public internet — use at least 12, or a passphrase."
  );
  process.exit(1);
}

console.log("\nSet this in the Railway environment:\n");
console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(password)}\n`);
console.log("And a session secret, if you have not set one:\n");
console.log(`SESSION_SECRET=${(await import("node:crypto")).randomBytes(32).toString("hex")}\n`);
