import { test, expect } from "@playwright/test";

// Repeatable page-load measurement across every route, run in CI against the
// production build (`next start`). Records server TTFB (Navigation Timing
// responseStart − requestStart) per page and logs it, so "page-load
// performance across every page under the same repeatable test conditions" is
// an actual number, not an inference. Signed-out, so gated routes measure the
// framework + auth-gate path (which makes no DB call without a session); /login
// and static routes measure pure framework render.
const ROUTES = [
  "/login",
  "/",
  "/today",
  "/today/summary",
  "/log",
  "/log/scan",
  "/weekly",
  "/recap",
  "/settings",
  "/onboarding",
  "/reanalyze",
  "/import",
  "/manifest.webmanifest",
];

// Only run this measurement on one engine to keep the numbers comparable.
test.describe("page-load timing (server TTFB)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "single-engine timing run");

  for (const path of ROUTES) {
    test(`TTFB ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "commit" });
      const status = res?.status() ?? 0;
      const ttfb = await page.evaluate(() => {
        const e = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming | undefined;
        return e ? e.responseStart - e.requestStart : -1;
      });
      // Logged so the CI output carries the measured value for every page.
      console.log(`PERF ${path} status=${status} ttfb=${ttfb.toFixed(1)}ms`);
      // Generous guard rail (avoids flaky red CI on a cold first byte); the
      // logged ttfb above is the real datum. Framework-only pages land well
      // under 50 ms; co-located production is faster still.
      expect(ttfb, `TTFB for ${path}`).toBeLessThan(500);
    });
  }
});
