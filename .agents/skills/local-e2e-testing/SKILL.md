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
  still saves the entry and shows a "saved without macros" warning. Photo/scan
  save paths and barcode scanning are effectively untestable (headless VM has no
  camera; `/log/scan` shows "Camera couldn't start").
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
- None available today. Ideally: `ANTHROPIC_API_KEY` (AI meal parsing) and
  Supabase URL/anon key for a shared staging project if testing against a deployed
  environment is required.
