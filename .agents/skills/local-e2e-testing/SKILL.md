---
name: local-e2e-testing
description: How to bring up Kcal-pal (Next.js 15 + Supabase) locally with a signed-in test account so server actions, logging flows and settings validation can be tested end-to-end in a browser.
---

# Local end-to-end testing for Kcal-pal

## Node version
The repo's tooling (rolldown native bindings) fails on Node 20. Node 22.12.0 works:

```bash
export PATH=/home/ubuntu/.nvm/versions/node/v22.12.0/bin:$PATH
node -v   # v22.12.0
npm install
```

The org blueprint installs Node 24 — if a build fails with a rolldown/native-binding
error, switch to 22.12.0 first before debugging anything else.

## Supabase stack
No `.env`/`.env.local` is committed and no Supabase credentials are exposed as
secrets, so testing normally means a local stack:

```bash
npx supabase start     # API 127.0.0.1:54321, Studio 54323, Mailpit 54324
```

Known failure: startup may abort with
`duplicate key value violates unique constraint "schema_migrations_pkey"` when two
migration files share the same numeric prefix (seen for 0010–0014). Workaround for
local testing only: temporarily rename the colliding files to unique prefixes
(`git checkout supabase/migrations` afterwards). If it recurs, the real fix belongs
in the repo, not in test setup.

Write a local-only `.env.local` from `npx supabase status` output:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
ALLOWED_EMAIL=tester@kcalpal.test   # login is gated on this
```

Then `npm run build && npx next start -p 3000`.

## Login (email OTP)
The login form asks for a numeric **code**, but the default local magic-link
template only contains a link. Add a local template containing `{{ .Token }}`
(e.g. `supabase/templates/magic_link.html`) and point
`[auth.email.template.magic_link]` at it in `supabase/config.toml`, restart
Supabase, then read the code from Mailpit at http://127.0.0.1:54324.

Only emails matching `ALLOWED_EMAIL` can sign in. New accounts land on
`/onboarding`; complete it (or update `profiles` directly) before testing
`/today`, `/log`, `/settings`.

## Useful facts when testing
- Protected routes (`/today`, `/log`, `/settings`, `/onboarding`, `/weekly`) redirect
  to `/login` via middleware; a stale/expired session can bounce a signed-in tab back
  to `/login` mid-run — re-login and repeat the step rather than assuming a bug.
- Without `ANTHROPIC_API_KEY` the AI meal parser fails **by design**: text logging
  still saves the entry and shows a "saved without macros" warning. Barcode
  scanning stays untestable (headless VM has no camera; `/log/scan` shows
  "Camera couldn't start" — that graceful message is the expected pass).
- The key must be present in the **server process** env, so start Next in a fresh
  shell with it bound at shell start (Devin: `exec` tool `env` param with a
  qualified `secret:...:ANTHROPIC_API_KEY` reference; never echo or write it).
  A restart of `next start` is required after binding — the running process will
  not pick it up.
- If every Claude call returns `400 ... anthropic-workspace-id is required when
  authenticating with an identity-linked API key`, the provisioned key is
  identity-linked and unusable: `lib/anthropic.ts` passes only `apiKey`. Ask for a
  standard key rather than debugging the app. A plain key works and
  `NUTRITION_MODEL = "claude-opus-4-8"` does resolve.
- Photo AI path needs no camera: `/log/photo` → **Pick from library** opens a file
  dialog where typing an absolute path (e.g. `/tmp/breakfast.jpg`) works. With a
  valid key, Claude vision returns a "Claude confidence: N%" line, an itemized
  description and prefilled macros; saving without touching them proves
  `nutrientColumnsFromForm` (compare the form values to the newest `food_entries`
  row and `select count(*) from storage.objects where bucket_id='food-photos'`).
- Claude calls are slow locally (photo vision ~25 s, bulk `/reanalyze` ~45 s for 4
  logs). Wait generously before concluding a flow hung.
- Micronutrient columns are `iron_mg, calcium_mg, magnesium_mg, vitamin_d_mcg,
  omega3_mg, folate_mcg, choline_mg, iodine_mcg` (there is no `vitamin_c_mg` or
  `potassium_mg`) — useful for asserting `/reanalyze` backfill.
- `/reanalyze` bulk appears to process **text-source logs only**; photo/barcode
  rows are excluded from the "N logs" count, so a photo row with missing micros
  may never be backfilled. It also re-parses `edited_by_user = true` rows and can
  overwrite manually entered calories. Pick a text row with NULL macros as the
  precondition, and run any per-entry Re-analyze test **before** the bulk run or
  the bulk pass makes it unfalsifiable.
- After a per-entry Re-analyze the row may keep rendering stale macros until a
  manual reload; reload before asserting the new values.
- Back-dated logging: `/log?date=YYYY-MM-DD` stores `consumed_at` at noon UTC.
  Verify with
  `docker exec supabase_db_Kcal-pal psql -U postgres -d postgres -c "select description, consumed_at from food_entries order by created_at desc limit 5;"`.
- Water target is stored in ml; the UI shows oz (100 oz ≈ 2957 ml) — check the
  DB value to prove the oz↔ml conversion.
- Pending labels from `components/ui/submit-button.tsx` are hard to capture: local
  server actions often finish in <150 ms. The entry-row "Saving…" state on
  `/today/summary` is the most reliably observable one; capture it with rapid
  `scrot` bursts right after clicking (`xdotool mousemove X Y click 1; scrot ...`)
  rather than the screenshot tool.
- Chrome's native `<input type="date">` refuses invalid values like `1990-13-01`,
  so the server-side `isCalendarDate` guard cannot be exercised through the UI.

## Devin Secrets Needed
- `ANTHROPIC_API_KEY` — required for all AI meal parsing (text, per-entry
  re-analyze, bulk `/reanalyze`, photo vision). Must be a standard,
  non-identity-linked key.
- Supabase URL/anon key for a shared staging project, only if testing against a
  deployed environment is required.
