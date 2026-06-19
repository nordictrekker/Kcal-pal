import { expect, afterEach } from "vitest";

// Component tests run in jsdom; pure-lib tests run in node. Only wire up the
// DOM matchers + auto-cleanup when a document actually exists, so the node
// tests are unaffected.
if (typeof document !== "undefined") {
  const matchers = await import("@testing-library/jest-dom/matchers");
  expect.extend(matchers);
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
