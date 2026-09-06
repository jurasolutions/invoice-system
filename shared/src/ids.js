/**
 * Internal ids. ULIDs, so a directory listing of `documents/` sorts into the
 * order the documents were created without opening any of them.
 *
 * These are internal only. Nothing here is ever printed on a document — the
 * client sees the running number, which is the thing that has to be gapless.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function randomBytes(n) {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) {
    throw new Error("No crypto.getRandomValues available — need Node 20+ or a modern browser");
  }
  return source.getRandomValues(new Uint8Array(n));
}

function encodeTime(ms) {
  let out = "";
  let remaining = ms;
  for (let i = 0; i < TIME_LEN; i++) {
    out = CROCKFORD[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

export function ulid(now = Date.now()) {
  const bytes = randomBytes(RANDOM_LEN);
  let random = "";
  for (let i = 0; i < RANDOM_LEN; i++) random += CROCKFORD[bytes[i] % 32];
  return encodeTime(now) + random;
}

export const newDocumentId = () => `doc_${ulid()}`;
export const newClientId = () => `cli_${ulid()}`;
export const newSectionId = () => `sec_${ulid()}`;
export const newItemId = () => `itm_${ulid()}`;
export const newPaymentId = () => `pay_${ulid()}`;
export const newAdjustmentId = () => `adj_${ulid()}`;

/** A filesystem-safe slug, for template filenames. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "untitled";
}

/** Ids arrive from the filesystem and from URLs. Keep them boring. */
export function isSafeId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}
