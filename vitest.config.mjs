import { defineConfig } from "vitest/config";

/**
 * One test run across the workspace.
 *
 * `shared/tests` covers the pure domain — money, numbering, the document
 * record. `backend/tests` covers the store against a real temporary data tree,
 * because the rules being tested are rules about what happens on disk.
 *
 * The frontend has no tests here on purpose: what matters about it is whether
 * a document lands on the page correctly, and that is checked in a real
 * browser by `npm run check:layout`, not by asserting on a virtual DOM.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/tests/**/*.test.mjs", "backend/tests/**/*.test.mjs"],
  },
});
