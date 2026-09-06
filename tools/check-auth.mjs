/**
 * Authentication check, against a running server.
 *
 *   npm run check:auth
 *
 * The point of a login is what it *refuses*, and that is the part which is
 * easy to get subtly wrong — a route that forgot the check, a cookie that is
 * not HttpOnly, a forged token the server accepts because the signature was
 * compared with `==`.
 *
 * So this asserts the refusals, not the happy path:
 *
 *   every data route is 401 without a session
 *   a wrong password is refused, and says nothing about which half was wrong
 *   a tampered token is refused
 *   an expired token is refused
 *   the session cookie is HttpOnly
 *   and only then: the right password works, and the session it gives reaches
 *   the data
 *
 * It runs against a temporary data tree on a spare port and touches nothing.
 */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(join(tmpdir(), "jura-auth-"));
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/__api`;

// A config, so that a signed-in request has something to succeed at. Without
// one the data routes answer 503 and the interesting assertion — that a valid
// session actually reaches the data — cannot be made.
const dataRoot = join(root, "data/invoices");
await mkdir(dataRoot, { recursive: true });
const { defaultConfig } = await import("@jura/shared/defaults/config.js");
await writeFile(join(dataRoot, "config.json"), JSON.stringify(defaultConfig(), null, 2), "utf8");

const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  ok    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

const server = spawn(process.execPath, ["backend/src/server.mjs"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    NODE_ENV: "development",
    JURA_DATA_PATH: dataRoot,
    JURA_OUTPUT_PATH: join(root, "outputs"),
    // Fixed, so a token can be forged in this test and correctly rejected.
    SESSION_SECRET: "check-auth-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (d) => process.stderr.write(`  [server] ${d}`));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

try {
  if (!(await waitForServer())) throw new Error("the server never came up");

  const DATA_ROUTES = [
    ["GET", "/bootstrap"],
    ["GET", "/documents"],
    ["GET", "/clients"],
    ["GET", "/templates"],
    ["GET", "/config"],
    ["POST", "/documents"],
  ];

  console.log("\nwithout a session");
  for (const [method, path] of DATA_ROUTES) {
    const r = await fetch(BASE + path, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? "{}" : undefined,
    });
    check(`${method} ${path} is refused`, r.status === 401, `got ${r.status}`);
  }

  console.log("\nbad credentials");
  const wrongPassword = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong" }),
  });
  check("wrong password is refused", wrongPassword.status === 401, `got ${wrongPassword.status}`);

  const wrongUser = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "nobody", password: "P@ssw0rd" }),
  });
  check("wrong username is refused", wrongUser.status === 401, `got ${wrongUser.status}`);

  const wrongUserBody = await wrongUser.json();
  const wrongPasswordBody = await wrongPassword.json();
  check(
    "neither says which half was wrong",
    wrongUserBody.error === wrongPasswordBody.error,
    `"${wrongUserBody.error}" vs "${wrongPasswordBody.error}"`
  );

  console.log("\nforged and stale tokens");
  const { createSession } = await import("../backend/src/auth.mjs");
  process.env.SESSION_SECRET = "check-auth-secret";

  const tampered = createSession("admin").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  const tamperedResponse = await fetch(`${BASE}/bootstrap`, { headers: { Authorization: `Bearer ${tampered}` } });
  check("a tampered signature is refused", tamperedResponse.status === 401, `got ${tamperedResponse.status}`);

  const expired = createSession("admin", Date.now() - 24 * 60 * 60 * 1000);
  const expiredResponse = await fetch(`${BASE}/bootstrap`, { headers: { Authorization: `Bearer ${expired}` } });
  check("an expired token is refused", expiredResponse.status === 401, `got ${expiredResponse.status}`);

  const forged = `${Buffer.from(JSON.stringify({ u: "admin", exp: Date.now() + 1e7 })).toString("base64url")}.nonsense`;
  const forgedResponse = await fetch(`${BASE}/bootstrap`, { headers: { Authorization: `Bearer ${forged}` } });
  check("an unsigned token is refused", forgedResponse.status === 401, `got ${forgedResponse.status}`);

  console.log("\nsigning in");
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "P@ssw0rd" }),
  });
  check("the right password is accepted", login.status === 200, `got ${login.status}`);

  const setCookie = login.headers.get("set-cookie") ?? "";
  check("the session cookie is HttpOnly", /HttpOnly/i.test(setCookie), setCookie);
  check("the session cookie is scoped to /", /Path=\//i.test(setCookie), setCookie);

  const { token } = await login.json();
  const cookie = setCookie.split(";")[0];

  const viaCookie = await fetch(`${BASE}/bootstrap`, { headers: { Cookie: cookie } });
  check("the cookie reaches the data", viaCookie.status === 200, `got ${viaCookie.status}`);

  const viaBearer = await fetch(`${BASE}/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });
  check("the bearer token reaches the data", viaBearer.status === 200, `got ${viaBearer.status}`);

  const session = await (await fetch(`${BASE}/auth/session`, { headers: { Cookie: cookie } })).json();
  check("the session names the user", session.user === "admin", JSON.stringify(session));
  check(
    "and admits it is on the default password",
    session.using_default_credentials === true,
    JSON.stringify(session)
  );

  console.log("\nsigning out");
  const logout = await fetch(`${BASE}/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  check("logout clears the cookie", /Max-Age=0/.test(logout.headers.get("set-cookie") ?? ""), "");
} finally {
  server.kill();
  await rm(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAuthentication holds: every data route refuses an unknown caller.");
