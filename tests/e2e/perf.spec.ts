import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { AUTH_STATE } from "./global-setup";

// Repeatable page-load measurement across every route, run against the
// production build (`next start`). Records server TTFB (Navigation Timing
// responseStart − requestStart) per page.
//
// This MUST run signed in. Measured signed-out, every gated route answers 307
// to /login in ~3 ms and the numbers look wonderful while saying nothing: they
// time a redirect, not a page. The assertion below therefore pins the status
// as well as the timing, so a redirect can never masquerade as a fast page.
//
// Each route is sampled several times and reported by median, so one cold
// first byte doesn't set the number.
const SAMPLES = 5;

// Routes behind the auth gate — these do the real work (DB reads, aggregation).
const AUTHED_ROUTES = [
  "/today",
  "/today/summary",
  "/log",
  "/log/scan",
  "/weekly",
  "/recap",
  "/settings",
  "/reanalyze",
  "/import",
];

// Public routes — framework render only, no session needed.
const PUBLIC_ROUTES = ["/login", "/manifest.webmanifest"];

async function ttfb(page: import("@playwright/test").Page, path: string) {
  const res = await page.goto(path, { waitUntil: "commit" });
  const status = res?.status() ?? 0;
  const value = await page.evaluate(() => {
    const e = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    return e ? e.responseStart - e.requestStart : -1;
  });
  return { status, value };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Only run this measurement on one engine to keep the numbers comparable.
test.describe("page-load timing (server TTFB)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "single-engine timing run",
  );

  for (const path of PUBLIC_ROUTES) {
    test(`TTFB ${path} (public)`, async ({ page }) => {
      const samples: number[] = [];
      let status = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const r = await ttfb(page, path);
        status = r.status;
        samples.push(r.value);
      }
      const med = median(samples);
      console.log(`PERF ${path} status=${status} ttfb_median=${med.toFixed(1)}ms`);
      expect(status, `${path} should render, not redirect`).toBe(200);
      expect(med, `TTFB for ${path}`).toBeLessThan(500);
    });
  }

  test.describe("signed in", () => {
    const storage = process.env.E2E_STORAGE_STATE ?? AUTH_STATE;
    // Without a seeded session these would measure the redirect, which is
    // worse than not measuring — so skip rather than report a fake number.
    test.skip(
      () => !fs.existsSync(storage),
      "no seeded session (set E2E_TEST_EMAIL/PASSWORD)",
    );
    test.use({ storageState: storage });

    for (const path of AUTHED_ROUTES) {
      test(`TTFB ${path}`, async ({ page }) => {
        const samples: number[] = [];
        let status = 0;
        for (let i = 0; i < SAMPLES; i++) {
          const r = await ttfb(page, path);
          status = r.status;
          samples.push(r.value);
        }
        const med = median(samples);
        console.log(
          `PERF ${path} status=${status} ttfb_median=${med.toFixed(1)}ms samples=[${samples
            .map((s) => s.toFixed(0))
            .join(",")}]`,
        );
        // A 307 here means the session didn't stick — the timing would be
        // measuring the redirect again.
        expect(status, `${path} should render signed in, not redirect`).toBe(200);
        expect(med, `TTFB for ${path}`).toBeLessThan(1500);
      });
    }
  });
});
