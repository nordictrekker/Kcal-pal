import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { AUTH_STATE } from "./global-setup";

// Signed-in feature flows. The global-setup seeds e2e-auth.json when
// E2E_TEST_EMAIL/PASSWORD are provided (CI secrets); otherwise this group skips
// so CI stays green without a test account.
const storage = process.env.E2E_STORAGE_STATE ?? AUTH_STATE;
const hasSession = fs.existsSync(storage);

test.describe("authenticated flows", () => {
  test.skip(!hasSession, "no seeded session (set E2E_TEST_EMAIL/PASSWORD)");
  test.use({ storageState: storage });

  test("today dashboard renders the calorie card", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByText(/kcal/i).first()).toBeVisible();
  });

  test("log page shows the meal + description form", async ({ page }) => {
    await page.goto("/log");
    await expect(page.getByText(/what did you eat/i)).toBeVisible();
    await expect(page.getByText(/^Meal$/)).toBeVisible();
  });

  test("today's log toggles to the 7-day average", async ({ page }) => {
    await page.goto("/today/summary");
    await page.getByRole("button", { name: /7-day average/i }).click();
    await expect(page.getByText(/of 7 days logged/i)).toBeVisible();
  });

  test("settings exposes the LDL impact metric group", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/LDL impact/i)).toBeVisible();
  });

  test("can step back to a prior day's log to edit it", async ({ page }) => {
    await page.goto("/today/summary");
    await page.getByRole("link", { name: /previous day/i }).click();
    // lands on a past day (URL carries the date) with the editable log heading
    await expect(page).toHaveURL(/\/today\/summary\?date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole("heading", { name: /^Log$/ })).toBeVisible();
    // and the "+ Log to this day" action targets that day, not today
    await expect(page.getByRole("link", { name: /log to this day/i })).toBeVisible();
  });
});
