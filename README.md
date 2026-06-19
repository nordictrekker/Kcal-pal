# Kcal-pal

A personal nutrition + women's-health PWA for a single user. It pulls data
from multiple health trackers into one place, reasons across food, cycle,
recovery, and activity, and turns it into simple tracking plus targeted,
warm guidance.

> Architecture, conventions, and the working backlog live in
> [`HANDOFF.md`](./HANDOFF.md). Backend wiring (env vars, migrations, edge
> functions, cron) lives in [`SETUP.md`](./SETUP.md). Deferred ideas are in
> [`TODO.md`](./TODO.md). A cross-browser/PWA test pass is in
> [`docs/qa-checklist.md`](./docs/qa-checklist.md).

## Stack

- **Next.js 15** (App Router) · TypeScript · Tailwind v4 · shadcn/ui
- **Supabase** — Postgres + Auth + Storage, RLS keyed by `auth.uid() = user_id`
- **Anthropic SDK** — model `claude-opus-4-8` (pinned as `NUTRITION_MODEL`)
- **USDA FoodData Central** — real per-100 g micronutrients (cached in `fdc_cache`)
- **Vercel** hosting · **PWA** with VAPID web push

## What it does

- **`/today`** — daily dashboard: calorie + macro/micro rings, recovery
  (Oura), weight trend + goal ETA, hydration, cycle forecast, and a
  rules-engine insight line. Greeting + signature produce motif.
- **`/log`, `/log/photo`, `/log/scan`** — log food by text, photo (vision),
  or barcode (OpenFoodFacts → Claude fallback) with a portion editor. Plus
  saved meals and an auto-detected "pantry" of frequent foods.
- **`/today/summary`** — the food log for a day, with a **Today ⇄ 7-day
  average** toggle. Every macro/micro expands to its top contributing foods;
  the 7-day view adds a generate-on-demand **food-insights** note (standout
  foods + how to lift lagging nutrients).
- **`/reanalyze`** — reprocess older logs through the current Claude + USDA
  pipeline to backfill micronutrients.
- **`/weekly`** ("Trends") — weekly LLM digest, rolling-average charts,
  cycle-over-cycle compare, correlations.
- **`/recap`** — 90-day report (print-to-PDF / email).
- **`/settings`**, **`/onboarding`** — profile, targets, phase modifiers,
  theme, install, push; first-run wizard.

Targets are personalized (Mifflin-St Jeor BMR, optionally Oura measured
burn) and adapt to cycle phase. Micro/macro contributions are attributed
per component food. Macros are never fabricated — a failed parse saves with
`null` values and surfaces the error to fix by hand.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000  (requires .env, see SETUP.md / .env.example)
npm run build    # production build
npm run test     # vitest (pure-lib unit tests)
npm run lint     # eslint
```

Copy `.env.example` to `.env.local` and fill in the values described in
[`SETUP.md`](./SETUP.md).

## Repository map

```
app/
  today/            dashboard + summary (Today/7-day toggle, contributors, insights)
  log/              text / photo / scan logging, saved meals, pantry
  reanalyze/        reprocess old logs through the current pipeline
  weekly/           trends: digest, charts, cycle compare, correlations
  recap/            90-day report
  settings/ onboarding/   profile, targets, phase modifiers, first-run wizard
  api/health/ingest/      token-auth Apple Health ingest endpoint (frozen, Phase B)
lib/
  cycle.ts cycles.ts      cycle-phase math, forecasting, aggregates
  targets.ts daily-targets.ts   BMR + adaptive targets, per-day resolution
  nutrients.ts contributions.ts food-items.ts   metric registry + per-food attribution
  fdc.ts                  USDA FoodData Central lookup + enrichment
  food.ts food-insights.ts pantry.ts   totals, insights prompt, frequent-food detection
  trends.ts insights.ts digest.ts   rollups, rules engine, weekly LLM digest
  anthropic.ts            all Claude calls (text/photo/barcode/recipe/digest)
supabase/migrations/      Postgres schema + RLS (idempotent, applied via Supabase MCP)
supabase/functions/       edge functions (Oura sync, push, cleanup)
```
