/**
 * Runs both halves for local development.
 *
 *   npm run dev
 *
 * The backend on :5175, the frontend on :5174 proxying `/__api` to it. That is
 * the same split as production — Cloudflare Pages in front of Railway — so a
 * mistake in how the two talk to each other shows up here rather than after a
 * deploy.
 *
 * A process runner would be a dependency for something `spawn` already does.
 * Output from each side is prefixed and coloured so it is obvious which one is
 * complaining.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const SERVICES = [
  { name: "api", colour: "\x1b[32m", args: ["run", "dev", "-w", "@jura/backend"] },
  { name: "web", colour: "\x1b[36m", args: ["run", "dev", "-w", "@jura/frontend"] },
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

for (const service of SERVICES) {
  const child = spawn(npm, service.args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  const label = `${service.colour}${service.name.padEnd(3)}${RESET} `;
  const prefix = (stream) => {
    stream.setEncoding("utf8");
    let carry = "";
    stream.on("data", (chunk) => {
      const lines = (carry + chunk).split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) console.log(label + line);
    });
  };
  prefix(child.stdout);
  prefix(child.stderr);

  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(`${label}exited with ${code}`);
    // One half without the other is not useful, so take the rest down too.
    shutdown(code ?? 1);
  });

  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 300).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

console.log("\n  api  http://localhost:5175   (backend, the data and the rules)");
console.log("  web  http://localhost:5174   (open this one)\n");
