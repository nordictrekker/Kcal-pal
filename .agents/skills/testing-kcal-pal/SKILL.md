---
name: testing-kcal-pal
description: How to run and UI-test the Kcal-pal Next.js PWA locally, including testing auth-gated pages (e.g. the /onboarding wizard) when no Supabase credentials are available.
---

# Testing Kcal-pal locally

## Running the app
- Node 22 or 24 is required (vitest/next fail on Node 20):
  `export PATH=/home/ubuntu/.nvm/versions/node/v22.12.0/bin:$PATH` (or `nvm use 24`).
- `npm ci`. If vitest fails to start with a missing rolldown binding, install the
  linux binary the lockfile omits: `npm i --no-save @rolldown/binding-linux-x64-gnu@<version>`.
- `npm run dev` (port 3000). Next refuses to boot server pages without
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a throwaway
  `.env.local` with dummy values is enough to render client-only UI (delete it
  afterwards — it is gitignored but should not linger).

## Auth model (important for test planning)
- `middleware.ts` → `lib/supabase/middleware.ts` redirects every path to `/login`
  unless the path starts with `/login`, `/auth`, `/api/health/ingest`, `/_next`,
  or is `/favicon.ico`. Login is a Supabase magic-link email allowlist
  (`ALLOWED_EMAIL`, see `app/login/actions.ts`), so without real Supabase
  credentials **no authenticated page (`/today`, `/weekly`, `/onboarding`,
  `/log`) can be reached**, and server actions return "Not signed in.".
- Required secrets to test authenticated flows end-to-end:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL` (+ mailbox access for the magic
  link, or `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` which `tests/e2e/global-setup.ts`
  uses to seed a session), plus `ANTHROPIC_API_KEY` and `USDA_FDC_API_KEY` for
  food logging / micronutrient enrichment.

## Workaround: testing auth-gated client components without credentials
Client components can be exercised by adding a **temporary, uncommitted** page
under a middleware-exempt path, e.g. `app/login/<something>-test/page.tsx`, that
renders the component directly with a mock prop payload matching what the real
server page builds. Example for the onboarding wizard: render
`OnboardingWizard` from `app/onboarding/wizard.tsx` with a `WizardPrefill`
mirroring `app/onboarding/page.tsx` (sex defaults to `female`,
`track_cycle: true`, `activity_level: "moderate"`, `goal: "maintain"`).
Delete the harness route and the dummy `.env.local` when done (`git status` must
be clean). Server actions invoked from such a harness will fail with
"Not signed in." — that is expected and still proves the submit wiring.

## Onboarding wizard specifics
- Steps in order: Welcome, About you, Body, Movement, Goal, Targets, Home base,
  Cycle. Male profiles drop "Cycle" → 7 steps/dots instead of 8.
- Progress dots are 6px-wide `<span>`s with no text; the DOM cannot tell you the
  count reliably at a glance — use the computer tool's `zoom` on the dot row
  (roughly x 400–620, ~28px tall, just above the step title) to count them and
  see which one is wide/highlighted.
- The last step's primary button reads "Finish" (with a check icon) instead of
  "Next" — a cheap way to confirm you are on the final visible step.
- The Home base step calls the free Open-Meteo geocoding API (no key), and the
  step is optional, so it can be skipped in tests.
