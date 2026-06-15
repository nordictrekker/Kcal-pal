# Kcal-pal — session handoff

Last updated end of session on 2026-06-15. Branch: `claude/follow-instructions-g107z`.

A fresh Claude Code conversation should read this top-to-bottom to pick
up where we left off. Everything below is what the previous session
either decided, built, or punted on.

## 1. What this app is

**Kcal-pal** is a personal nutrition + women's-health PWA for a single
user (juliefloodreiff@gmail.com) — a centralized place where data from
multiple fitness/health trackers feeds in, the app reasons across it,
and the user gets targeted advice and simple tracking. The pitch:
"all your decentralized health information feeding into one platform
that understands the dynamic nature of your food and fitness needs."

Phase plan agreed with the user:

- **Phase A — now (PWA)**: web-only features that survive the native
  migration. Most of what we've built falls here.
- **Phase B — 1–2 months out (Native iOS)**: Capacitor wrap or pure
  Swift, with an Apple Developer account. Unlocks HealthKit symptom
  ingestion, native workouts, native push, widgets, Apple Watch
  complication. **Stop investing in PWA-iOS hacks (paste-the-link
  login, web push) — Phase B replaces them.**
- **Phase C — future users**: per-user Oura OAuth, Whoop/Strava/
  Garmin/CGM integrations, multi-user infrastructure (allowlist →
  invite codes → public signup), billing if applicable.

## 2. Tech stack (pinned)

- **Next.js 15** App Router, TypeScript, Tailwind v4, shadcn/ui
- **Supabase** Postgres + Auth + Storage, RLS keyed by
  `auth.uid() = user_id` on every table
- **Anthropic SDK** with model `claude-opus-4-8` — **always use this
  model going forward**, do not downgrade
- **PWA** with VAPID push, paste-the-link iOS login workaround (a
  Phase B casualty)
- **Health Auto Export** iOS app is the preferred path for ingesting
  Apple Health data (our `/api/health/ingest` already accepts its
  `{metrics:[...]}` shape — confirmed this in earlier turns)

## 3. Branch + recent commits

Current branch: `claude/follow-instructions-g107z`. PR has NOT been
opened; the user has not asked for one. Recent commit order, most
recent first:

All on branch `claude/pensive-newton-yax657` (preview deploys; Vercel
production still tracks `follow-instructions-g107z` — merge/redirect
when ready):

0c. Oura recovery card now surfaces **resilience + daytime stress**
    (data was already synced, never shown). Display-only for now.
0b. **Weekly intelligence** — "Your cycle patterns" card (per-phase
    baselines from the user's own history: appetite/sleep/recovery in
    HER numbers) + "What moves your numbers" plain-language next-day
    correlations (sleep→carbs/cal, water→readiness, protein→HRV). New
    pure `phaseBaselines`/`describePhasePatterns` in lib/cycles.ts. No
    new queries, no model calls.
0a. Insight engine expansion — 6 new rules (under-fueling / low-energy-
    availability, post-exertion easy day, HRV-dip overreach, sleep-debt
    week, protein-consistency win, weekend permission) + a new
    `proteinHitStreak` trend signal. Eight Sleep cron unscheduled; all
    edge functions redeployed via MCP.
1. Recipes + goal projection + audit polish
2. 90-day recap page (HTML view, print-to-PDF, mailto: email)
3. Cycle intelligence (forecasting + cross-cycle compare + 30/90d tabs)
4. Fix sign-in: read OTP type from URL (verifyOtp was hard-coding
   `magiclink` — broke first-time signups)
5. Remove manual cycle stepper (fully auto-tracked now)
6. Cycle automation, smarter targets, onboarding wizard
7. Trend memory, weekly digest, hydration tracking
8. Subtle phase florals + holistic insight line
9. (earlier: design refresh, cycle-phase nutrition, saved meals,
   weight log + target tuning, paste-the-link login, …)

## 4. PENDING: things the USER needs to do

The session ran ahead of deploy plumbing several times. As of now:

### 4a. Supabase migrations not yet applied

The user runs migrations manually in the SQL Editor — there's NO
Supabase MCP available in this environment despite multiple connection
attempts. Migrations 9–14 are committed but the user may not have
applied all of them yet. Order matters; idempotent so safe to re-run.

```
0009_water_logs.sql        — hydration table + daily_water_target_ml
0010_weekly_digests.sql    — cached LLM weekly digest
0011_oura_expanded.sql     — total_calories + sleep architecture columns
0012_profile_onboarding.sql— onboarding/target/cycle profile fields
0013_recipes.sql           — recipe library
0014_goal_weight.sql       — goal_weight_lbs on profiles
```

If the user hits "column does not exist" runtime errors after pulling
the branch, that's a missing migration.

### 4b. Edge function redeploy — DONE (2026-06-15)

All three edge functions were redeployed via the Supabase MCP (now
available in-session — see §8). Current versions:
sync-oura v16, send-quarterly-push v8, cleanup-orphans v8 — all ACTIVE,
all `verify_jwt: false`. The expanded Oura pull (total_calories, sleep
architecture, optional spo2/stress/resilience) is now live.

### 4c. Vercel auto-deploys from the branch push, no action needed.

### 4d. Apple Health ingestion — DEFERRED TO PHASE B (user decision, 2026-06-15)

The user does **not** want to use Health Auto Export or any third-party
bridge. Apple Health data (steps, weight, menstrual flow, HRV, sleep,
active energy, workouts, symptoms, caffeine, etc.) will come in via
**native HealthKit once we're an iOS app** — no web ingestion hacks.
Do NOT build new features that depend on the `/api/health/ingest`
endpoint, the iOS Shortcut, or HAE. The endpoint can stay for now but
is frozen. This also pushes the roadmap's "auto-hydration from Apple
Health" and "active-energy / body-fat from HAE" ideas to Phase B.

## 5. What's built (mental map of features)

### `/today`
Greeting with first name → optional phase chip → insight line (rules
engine output). Cards in order:
- `OuraCard` (gated on env var)
- `WeightCard` with trend + ETA projection
- `WaterCard` with +8/+16/+20 oz quick-add + undo
- `CycleForecastCard` — next period date, fertile window
- `MacroTotals` with phase-adjustment hint and auto-target source
  note ("Auto from your 7-day Oura burn (~2,150 kcal/day)")
- `EntryList`
- Footer nav: Trends / Recap / Settings
- Floating "+ Log food" FAB

### `/log`, `/log/photo`, `/log/scan`
Text, vision (Anthropic), barcode (OpenFoodFacts → Anthropic
fallback). Quick-action tiles: Scan / Photo / Recipes.

### `/recipes`
Paste URL → server fetches page → Claude parses ingredients +
per-serving macros → save. Each card has servings stepper, scaled
macros preview, one-tap Log button.

### `/weekly` (badged "Trends")
- `DigestCard` — weekly LLM digest (cached 1h in `weekly_digests`)
- 14/30/90-day range tabs (`?range=` search param)
- Rolling-average line charts (calories, protein, sleep, HRV, weight,
  water)
- `CycleCompareCard` — latest closed cycle vs previous
- Scatter chart: protein vs next-day HRV with Pearson r

### `/recap`
90-day full report. Section grid stats + cycle compare table. Two
toolbar buttons: **Save as PDF** (window.print + print stylesheet)
and **Email it** (mailto: with plain-text version of the report).

### `/settings`
- `ProfileCard` (Body & goals) — name, DOB, sex, height, activity,
  goal, goal weight, target mode (auto/manual), cycle settings
- `TargetsCard` — manual daily macro + water targets
- `PhaseModifiersCard` — 4×5 percentage grid for per-phase target
  multipliers + reset button
- `ThemeToggle`, `InstallCard`, `Notifications` (VAPID), `ShortcutCard`
  (Apple Health POST URL + Bearer token)

### `/onboarding`
First-run wizard, skipped if `profiles.onboarding_completed = true`.
Steps: welcome → DOB/sex → height/weight → activity → goal (+ goal
weight) → target mode → cycle.

### `/api/health/ingest`
Token-auth endpoint accepting two body shapes:
- `{ samples: [{ metric, value, unit, recorded_at }, …] }`
- `{ metrics: [{ name, units, data: [{ qty, date }] }, …] }` (HAE)

Recognizes `menstrual_flow` and auto-advances
`profiles.last_period_start` to the latest detected period cluster.
Body weight samples backfill into `body_weights`.

## 6. Core architecture decisions

- **No manual cycle stepper.** Cycle day + phase derived every load
  from `profiles.last_period_start` (kept current by the Apple Health
  flow ingest). `lib/cycle.ts` + `lib/cycles.ts` hold all of the math.
  The `cycle_days` table is kept for any historical data but the UI
  no longer writes to it.
- **Phase modifiers compose with auto targets.** The smart-target
  computation (`lib/targets.ts`) produces base targets; phase
  modifiers (`lib/phase-modifiers.ts`) multiply on top. Order: base
  → auto/manual → phase.
- **Cycle math is personalized.** `phaseForCycleDay` takes
  CycleSettings (length + period length) so luteal stays ~14 days
  regardless of cycle length.
- **Trend memory is pure.** `lib/trends.ts` aggregates the 14-day
  window into rollups + streaks; insights engine reasons over it.
- **Insights are a rules engine,** not an LLM call. Priority-sorted
  in `lib/insights.ts`. The weekly digest IS an LLM call but cached.
- **Targets prefer Oura measured burn.** When `target_mode = "auto"`
  and we have ≥1 day of `oura_daily.total_calories`, the 7-day mean
  becomes TDEE. Falls back to BMR × activity multiplier.

## 7. Key files (where to look first)

```
lib/
  cycle.ts            phase math, period-start detection, derivedPhases
  cycles.ts           forecast, period history, cycle aggregates
  targets.ts          Mifflin-St Jeor BMR, computeTargets, weight projection
  trends.ts           14-day rollups, streaks, rolling averages
  insights.ts         priority-sorted rules engine
  digest.ts           weekly LLM digest + isoYearWeek/weekLabel helpers
  anthropic.ts        all Claude calls (text/photo/barcode/recipe/digest)
  food.ts             totals, MEALS, isMeal, dayBounds
  oura.ts             v2 API client (Node and Deno-compatible)
  apple-health.ts     manual JSON/CSV import parser
  phase-modifiers.ts  per-phase target multipliers
  stats.ts            mean, rolling avg, Pearson r, lastNDays, localDay

app/today/
  page.tsx                       the big one — wires everything together
  cycle-forecast-card.tsx        next period + fertile window
  weight-card.tsx                weight + trend + goal ETA
  water-card.tsx                 hydration
  oura-card.tsx                  recovery snapshot
  macro-totals.tsx               headline + bars + adjustment notes
  florals.tsx                    phase-specific botanical SVGs
  entry-list.tsx, entry-row.tsx  today's meals
  sync-actions.ts                manual Oura sync trigger
  weight-actions.ts, water-actions.ts, actions.ts

app/weekly/
  page.tsx        Trends with range tabs
  charts.tsx      LineChart + ScatterChart (SVG)
  digest-*        LLM weekly digest
  cycle-compare.tsx, range-tabs.tsx

app/recap/        90-day report

app/recipes/      library + URL import

app/settings/     profile, targets, phase mods, theme, install, push, shortcut

app/onboarding/   first-run wizard

app/api/health/ingest/route.ts   Health Auto Export / Shortcut endpoint
supabase/functions/sync-oura/    Edge function for nightly Oura cron
```

## 8. Known issues / open threads

- **Service role key was rotated** earlier in the project after a
  GitGuardian alert. Currently uses `sb_secret_*` style key (not a
  JWT) — the edge function and `/api/health/ingest` both compare
  against `SUPABASE_SERVICE_ROLE_KEY` env var. Verify JWT must be
  OFF on any deployed edge function.
- **Supabase + Vercel MCP ARE available now** (as of 2026-06-15). The
  earlier egress-allowlist limitation no longer applies in this
  environment — we can query the DB, run SQL, deploy edge functions,
  and inspect Vercel deploys directly. (GitHub MCP works too.)
- **Eight Sleep is fully removed.** The nightly cron (`jobid 2`,
  `sync-eight-sleep-nightly`) was unscheduled; the integration code was
  already gone. The deployed `sync-eight-sleep` edge-function *shell*
  still lingers because the MCP has no delete-function tool — delete it
  with one click in the dashboard (Edge Functions → sync-eight-sleep →
  Delete). Harmless until then (no cron invokes it).
- **The `cycle_days` table is effectively deprecated.** Kept around
  for any historical rows. No UI writes to it. Don't add features
  that depend on it; use `last_period_start` derivation instead.
- **iOS PWA push** is wired up but limited. Don't expand it; Phase B
  brings native push.

## 9. Phase A backlog + roadmap

User reviewed a full Phase A roadmap (2026-06-15) and endorsed all of
it, minus anything that depends on Health Auto Export / web Apple
Health ingestion (→ Phase B, see §4d). Tags: ⚡ = uses data we already
have; 🔌 = needs new plumbing.

**Shipped this session:** expanded insight rules; per-phase baselines
card; plain-language correlations card; Oura resilience/stress surfaced.

**Next up (recommended order), all non-HAE:**
1. **Personalized baselines → daily insight** ⚡ — feed the new
   `phaseBaselines` deltas into the /today insight line so the daily
   message speaks in her numbers (extends commit 0b onto /today; note
   it adds a wider historical query to the hot path).
2. **Temperature-based ovulation confirmation** ⚡ — `oura_daily`
   `temp_deviation` is synced (11/14 rows populated) but unused. A
   biphasic-shift detector confirms ovulation vs the current calendar
   estimate (nextPeriod−14). TRUST-CRITICAL: validate thresholds
   against real data before shipping — false positives erode trust.
3. **Adaptive targets** ⚡ — compare actual weight trend
   (`weightTrendLbsPerWeek`, already built) to the rate the calorie
   target implies; surface a gentle "your numbers suggest nudging the
   target" note. Sensitive — keep it a suggestion, never silent.
4. **Recipe / saved-meal gap filler** ⚡ — suggest a saved recipe that
   closes today's macro gap.
5. **Insight feedback loop** 🔌 — thumbs/dismiss on the daily line;
   down-rank disliked rules (also unlocks the data-driven weekend
   pattern + sleep→next-day-protein-lag rules).
6. **Resilience/stress → insight rule** ⚡ — currently display-only;
   add an InsightContext field + rule (e.g. low resilience → rest).
7. **Onboarding polish** ⚡ — progress bar, back-edit any step, smarter
   per-step defaults, optional connect-Oura step.
8. **Long-term / monthly trends view** ⚡ — dedicated monthly +
   cycle-over-cycle view with the weight-trend goal-ETA chart.
9. **Edit a logged entry's macros** ⚡ — supports the "never fabricate,
   let her fix" rule.
10. **Offline logging (PWA)** 🔌; **full data export (CSV/JSON)** ⚡;
    **USDA FoodData Central** 🔌 for AI-free common-food logging.
11. **UX/aesthetic:** skeleton/loading + empty states ⚡, chart
    annotations (period markers, target bands) ⚡, dark-mode contrast +
    reduced-motion ⚡, subtle goal/streak delight ⚡.
12. **Reliability:** sync observability (`sync_log` + "last synced" in
    Settings) 🔌; unit tests for the pure libs (cycle/cycles/targets/
    trends/insights) ⚡.

**Deferred to Phase B** (don't build now):

- Symptom check-in (HealthKit gives us all 30+ reproductive health
  symptom category types from Oura/NC/etc.)
- Workout log with intensity (HKWorkout from Apple Watch / Strava /
  Peloton — read once, get all of it)
- Caffeine tracking (HKQuantityTypeIdentifierDietaryCaffeine)
- Smart push notifications (native is much better than PWA push)
- Apple Watch complication, home screen widget
- Apple Sign In (replaces paste-the-link kludge)

**Deferred to Phase C** (when friends start using it):

- Per-user Oura OAuth (replace personal access token)
- Strava, Whoop, Withings, Garmin integrations
- CGM (Levels/Stelo/Lingo)
- Cronometer / MyFitnessPal import wizards
- Email allowlist → invite codes → public signup
- Billing if it goes paid

## 10. Working agreements

- **Single user for now.** Hard-coded `ALLOWED_EMAIL` gate everywhere.
  Don't build multi-user infrastructure until Phase C.
- **Never fabricate macros.** If Anthropic parse fails, save the
  entry with `null` macros and surface the error — the user wants to
  fix it manually rather than trust a made-up number.
- **Idempotent migrations.** Every `alter table` uses `if not
  exists`. Every `create policy` uses drop-then-create.
- **Mobile-first.** `max-w-md` everywhere except the recap page
  (`max-w-2xl` so the PDF export reads nicely).
- **Warm voice in copy.** Reassurance > prescription. "Lean in" not
  "you should". The user has corrected this twice — keep it warm.
- **Use Opus 4.8.** Pinned in `lib/anthropic.ts` as `NUTRITION_MODEL`.
  All new LLM features should use the same constant.
- **Don't sink time into PWA iOS workarounds** that Phase B replaces.

## 11. Resuming work

A fresh session should:

1. `git pull` the branch.
2. Check whether migrations 9–14 are applied (user can confirm).
3. Read this file. Then `app/today/page.tsx` to refresh on how
   things are wired together.
4. Pick a feature from §9 or ask the user what's next.

If the user reports a runtime error after `git pull`, first guess is a
missing migration; second guess is missing env var (cross-check
`SETUP.md`); third guess is a real bug.
