import { test, expect } from "@playwright/test";

// "Add to home screen" (PWA installability) coverage on the real Chrome + Safari
// engines. These assert the manifest is installable and the iOS home-screen
// head tags + icons are actually served — the things that silently break an
// installed standalone app. Runs unauthenticated, so it executes on every
// project (desktop + mobile Chrome/Safari).

test("manifest is installable (standalone, start_url, icons)", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();

  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toContain("/today");
  expect(m.theme_color).toMatch(/^#/);
  expect(m.background_color).toMatch(/^#/);

  const sizes = (m.icons ?? []).map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  // a maskable icon is required for a non-letterboxed Android/desktop install
  expect(
    (m.icons ?? []).some((i: { purpose?: string }) => (i.purpose ?? "").includes("maskable")),
  ).toBeTruthy();
});

test("every manifest icon is actually served as an image", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  for (const icon of m.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.ok(), `${icon.src} should return 200`).toBeTruthy();
    expect(res.headers()["content-type"], `${icon.src} content-type`).toContain("image");
  }
});

test("iOS add-to-home-screen head tags are present", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  // installed iOS app runs standalone + uses the apple-touch-icon
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"][content="yes"]')).toHaveCount(1);
  const appleIcons = page.locator('link[rel="apple-touch-icon"]');
  expect(await appleIcons.count(), "an apple-touch-icon link must be present").toBeGreaterThan(0);

  // and the apple-touch-icon URL must actually resolve
  const href = await appleIcons.first().getAttribute("href");
  expect(href).toBeTruthy();
  const res = await page.request.get(href!);
  expect(res.ok(), `apple-touch-icon ${href} should return 200`).toBeTruthy();
});
