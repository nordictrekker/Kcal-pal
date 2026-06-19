import { test, expect } from "@playwright/test";

// Flows reachable without a session — they run on Chromium (Chrome) and WebKit
// (Safari), desktop and mobile. They catch real-engine rendering, redirects,
// and responsiveness regressions the jsdom unit tests can't.

test("login page renders the email sign-in form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: /email/i }).or(page.locator('input[type="email"]'))).toBeVisible();
  await expect(page.getByRole("button", { name: /send|code|sign|continue/i }).first()).toBeVisible();
  expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
});

test("a signed-out user is redirected from a gated route to /login", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});

for (const path of ["/login", "/today", "/log", "/weekly"]) {
  test(`no horizontal overflow at mobile width: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish
    await page.goto(path);
    // gated routes land on /login; either way assert the rendered page fits.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow of ${overflow}px on ${path}`).toBeLessThanOrEqual(1);
  });
}

test("the web app manifest is served and valid", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty("name");
});
