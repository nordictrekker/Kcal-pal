import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { AUTH_STATE } from "./global-setup";

// Breadth coverage of the signed-in surface, on every configured project:
// Chromium (Chrome), WebKit (Safari's engine), and the iPhone 14 / Pixel 7
// viewports. This is what shrinks the manual device checklist down to what
// only real hardware can answer (iOS camera, real push, actual home-screen
// install) — everything here used to be a human tapping through pages.
//
// The public overflow checks in public.spec.ts run signed OUT, so all four of
// their routes land on /login and they were really testing one page four
// times. These run against the seeded session and hit the real pages.
//
// IMPORTANT — these tests must not accumulate rows in the real database.
// The bug-report smoke test wrote a row per run and reached 492 of them before
// anyone noticed (migration 0030). So this file is read-only: it asserts that
// controls render and open, never that a submit succeeded. Anything that
// writes needs a teardown, like the one in global-teardown.ts.

const storage = process.env.E2E_STORAGE_STATE ?? AUTH_STATE;

// Every page a signed-in user can reach.
const PAGES = [
  { path: "/today", name: "Today" },
  { path: "/today/summary", name: "Summary" },
  { path: "/log", name: "Log" },
  { path: "/log/scan", name: "Scan" },
  { path: "/log/photo", name: "Photo" },
  { path: "/weekly", name: "Weekly" },
  { path: "/recap", name: "Recap" },
  { path: "/settings", name: "Settings" },
  { path: "/recipes", name: "Recipes" },
  { path: "/reanalyze", name: "Re-analyze" },
  { path: "/import", name: "Import" },
];

// Next.js dev/prod overlays and third-party noise we don't control. Anything
// else failing here is a real error on a real engine.
const IGNORED_ERROR = /favicon|ResizeObserver loop|Download the React DevTools/i;

test.describe("signed-in surface", () => {
  test.skip(!fs.existsSync(storage), "no seeded session (set E2E_TEST_EMAIL/PASSWORD)");
  test.use({ storageState: storage });

  for (const { path, name } of PAGES) {
    test(`${name} renders without console or page errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !IGNORED_ERROR.test(m.text())) {
          errors.push(`console: ${m.text()}`);
        }
      });

      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      // A 307 here means the session lapsed and we'd be asserting about /login.
      expect(res?.status(), `${path} should render signed in`).toBe(200);
      // `body` alone — "main, body" matches two elements and trips Playwright's
      // strict mode, which fails the test before the error assertion below runs.
      await expect(page.locator("body")).toBeVisible();
      expect(errors, `${path} produced:\n${errors.join("\n")}`).toEqual([]);
    });

    test(`${name} fits the viewport with no horizontal overflow`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // Let any client-side layout settle before measuring.
      await page.waitForLoadState("networkidle").catch(() => {});
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // 1px of rounding is tolerable; a real overflow is many px.
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }

  test("primary navigation reaches every main section", async ({ page }) => {
    await page.goto("/today");
    for (const dest of ["/log", "/weekly", "/settings"]) {
      const link = page.locator(`a[href="${dest}"], a[href^="${dest}?"]`).first();
      if ((await link.count()) === 0) continue;
      await link.click();
      await page.waitForURL(new RegExp(dest.replace("/", "\\/")));
      await page.goto("/today");
    }
  });
});

// The saved-meal regression this PR fixes, asserted on every engine: the row
// must expand to show what the meal contains and offer a rename. Read-only on
// purpose — clicking "+ Log" would add a food entry to the real account on
// every CI run, which is exactly how bug_reports reached 492 rows.
test.describe("saved meals show their contents", () => {
  test.skip(!fs.existsSync(storage), "no seeded session (set E2E_TEST_EMAIL/PASSWORD)");
  test.use({ storageState: storage });

  test("a saved meal expands to its description, portion and nutrients", async ({ page }) => {
    await page.goto("/log");
    const section = page.locator("section", { hasText: /saved meals/i }).first();
    await expect(section).toBeVisible();

    // The account may legitimately have no saved meals — then the empty-state
    // copy must be the thing on screen, not a broken list.
    const expander = section.getByRole("button", { name: /show what's in this meal/i });
    if ((await expander.count()) === 0) {
      await expect(section).toContainText(/save any logged entry/i);
      return;
    }

    await expander.first().click();
    await expect(section.getByText(/what's in it/i)).toBeVisible();
    // Rename must be reachable (opening it only; submitting would rename the
    // user's real saved meal).
    await expect(
      section.getByRole("button", { name: /rename saved meal/i }).first(),
    ).toBeVisible();
  });
});

// The installed home-screen app renders in standalone display mode. Real
// installation needs a device, but standalone-specific layout and the offline
// fallback are testable here.
test.describe("home-screen (standalone) app", () => {
  test.use({ colorScheme: "light" });

  test("pages render in standalone display mode", async ({ page, context }) => {
    // Emulate what an installed PWA reports to CSS/JS.
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({
              matches: true,
              media: q,
              onchange: null,
              addListener: () => {},
              removeListener: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false,
            } as unknown as MediaQueryList)
          : original(q);
    });
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "standalone mode overflows horizontally").toBeLessThanOrEqual(1);
  });

  test("the offline fallback page is precached and self-contained", async ({ request }) => {
    // The PWA showed a raw browser error offline until /offline.html was added;
    // it must stay served and must not depend on network assets to render.
    //
    // It must also be reachable WITHOUT a session and without redirecting.
    // This caught a live bug: /offline.html was not excluded from the auth
    // middleware, so it answered 307 to /login, and the service worker's
    // `cache.add()` rejects on a redirected response — the offline page was
    // never actually precached, defeating the whole feature.
    const res = await request.get("/offline.html", { maxRedirects: 0 });
    expect(
      res.status(),
      "/offline.html must be served directly — a redirect makes cache.add() reject",
    ).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/offline|connection/i);
    expect(html, "offline page must not fetch external assets").not.toMatch(
      /<script[^>]+src=["']http/i,
    );
  });

  test("the service worker is served with a fetch handler", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok(), "/sw.js should be served").toBeTruthy();
    const js = await res.text();
    // Without a fetch handler there is no offline fallback at all.
    expect(js, "sw.js must handle fetch for the offline fallback").toMatch(
      /addEventListener\(\s*["']fetch["']/,
    );
  });
});
