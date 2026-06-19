// Registers @testing-library/jest-dom matchers on vitest's `expect` (typed,
// import-time safe in node). Component tests run in jsdom via a per-file
// `// @vitest-environment jsdom` docblock; pure-lib tests stay in node. Only
// run RTL's DOM cleanup when a document actually exists.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
