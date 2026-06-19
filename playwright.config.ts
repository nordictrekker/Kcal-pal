import { defineConfig, devices } from "@playwright/test";

// End-to-end tests on real browser engines. Runs Chromium (Chrome) and WebKit
// (Safari's engine), plus iPhone/Pixel viewport emulation for the mobile +
// home-screen-PWA surfaces. Browsers can't be downloaded in every sandbox, so
// these run in CI (.github/workflows/e2e.yml) and locally after
// `npx playwright install`.
const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // Seeds a signed-in session into e2e-auth.json when E2E_TEST_EMAIL/PASSWORD
  // are set, so the authenticated specs run; a no-op otherwise.
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "safari", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  // Builds and serves the production app; the env (Supabase public URL + key)
  // is provided by CI / the local shell.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
