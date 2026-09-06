/**
 * Writing files so that a crash cannot leave a half-written one behind.
 *
 * Every write goes to a temp file in the same directory, is flushed to the
 * disk, and is then renamed over the target. Rename within a directory is
 * atomic, so a reader sees either the old file or the new one, never a
 * truncated mixture. This matters most for `counters.json`: a torn counter
 * means either a duplicate invoice number or a gap, and both are the kind of
 * thing an auditor asks about.
 *
 * The lock is a directory rather than a file, because `mkdir` fails if the
 * directory exists and that failure is atomic on every filesystem that matters
 * here. A lock that cannot be acquired refuses the operation and says so. It
 * does not wait forever and it does not break a lock it did not take — a
 * guessed number is worse than a refused one.
 */
import { open, mkdir, rmdir, rename, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export async function readJson(path, fallback = undefined) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

export async function writeJsonAtomic(path, value) {
  const text = JSON.stringify(value, null, 2) + "\n";
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);

  let handle;
  try {
    handle = await open(temp, "w");
    await handle.writeFile(text, "utf8");
    // Flush the contents before the rename, so a power cut cannot leave the
    // new name pointing at an empty file.
    await handle.sync();
  } finally {
    await handle?.close();
  }

  try {
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }

  // Flush the directory entry too. Not supported everywhere; where it is not,
  // the rename is still atomic, it is just not yet durable.
  let dirHandle;
  try {
    dirHandle = await open(dir, "r");
    await dirHandle.sync();
  } catch {
    // Windows refuses to open a directory for reading. Nothing to do.
  } finally {
    await dirHandle?.close().catch(() => {});
  }

  return value;
}

export class LockBusyError extends Error {
  constructor(path, heldForMs) {
    super(
      `Could not take the lock at ${path}. Another issue is in progress, or a previous one crashed. ` +
        (heldForMs != null ? `The lock has been held for ${Math.round(heldForMs / 1000)}s. ` : "") +
        "Nothing has been changed. If you are certain nothing else is running, delete that directory and try again."
    );
    this.name = "LockBusyError";
    this.code = "LOCK_BUSY";
    this.lockPath = path;
  }
}

/**
 * Run `fn` while holding an exclusive lock.
 *
 * Retries briefly, because the common case is two clicks half a second apart
 * rather than a crashed process. Past the timeout it refuses and reports, and
 * deliberately leaves the stale lock in place for a person to look at.
 */
export async function withLock(lockPath, fn, { timeoutMs = 5000, pollMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (!acquired) {
    try {
      await mkdir(lockPath);
      acquired = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        const heldFor = await stat(lockPath).then((s) => Date.now() - s.mtimeMs).catch(() => null);
        throw new LockBusyError(lockPath, heldFor);
      }
      await sleep(pollMs);
    }
  }

  try {
    await writeFile(join(lockPath, "owner"), `${process.pid} ${new Date().toISOString()}\n`, "utf8").catch(() => {});
    return await fn();
  } finally {
    await unlink(join(lockPath, "owner")).catch(() => {});
    await rmdir(lockPath).catch(() => {});
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
