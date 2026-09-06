/**
 * The domain, in one import.
 *
 * Everything here is pure — no filesystem, no network, no DOM. That is what
 * lets the browser and the API share it, and it is why the totals in the live
 * preview and the totals written to the database cannot disagree.
 *
 * Most callers import the specific module (`@jura/shared/money.js`) so it is
 * obvious what a file depends on. This barrel is for the few places that want
 * a lot of it at once.
 */
export * from "./money.js";
export * from "./numbering.js";
export * from "./dates.js";
export * from "./document.js";
export * from "./ids.js";
