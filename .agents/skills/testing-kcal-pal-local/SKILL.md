---
name: testing-kcal-pal-local
description: Bring up a fully local Kcal-pal runtime (Supabase docker + next dev + stubbed Claude), sign a browser in without magic links, and drive camera-only / error-path flows for end-to-end testing.
---

# Local end-to-end testing for Kcal-pal

Use this when you need to drive the real UI (delete, water, scan, import, settings) without hosted
Supabase / Anthropic / VAPID credentials.

## Devin Secrets Needed
None for the local path. Optional if available: `ANTHROPIC_API_KEY` (real Claude estimates),
hosted `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY`.

## Stack bring-up
1. Node: `export PATH=/home/ubuntu/.nvm/versions/node/v22.12.0/bin:$PATH` (Node 20 breaks vitest).
2. `supabase start` in the repo. The CLI may refuse `supabase/migrations` because several files share a
   version prefix (0010–0014 duplicates). Workaround: apply the SQL files by hand in filename order,
   e.g. `for f in supabase/migrations/*.sql; do docker exec -i supabase_db_<project> psql -U postgres -d postgres < "$f"; done`.
3. `.env.local` → `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, local anon + service-role keys,
   `ALLOWED_EMAIL=<test email>`.
4. `nohup npm run dev >> /tmp/dev.log 2>&1 &` and tail `/tmp/dev.log` — the PR's structured logs appear
   there as `[kcal-pal] <scope>: …`.
5. psql is not installed on the host; use `docker exec supabase_db_<project> psql -U postgres -d postgres -c "…"`.

## Signing the browser in (login form is magic-link/6-digit only)
Local GoTrue returns a PKCE token, not the 6-digit code the form wants, so seed cookies instead:
create a user with the service-role key, then a small script inside the repo (so `@supabase/ssr`
resolves — scripts in `/tmp` fail with ERR_MODULE_NOT_FOUND) that calls
`createServerClient(...).auth.signInWithPassword(...)`, captures the cookies from `setAll`, and injects
them into the running Chrome with CDP `Network.setCookie` (domain `localhost`).
The session expires after ~1h — if a page suddenly redirects to `/login`, just re-run the script.

## Camera-only barcode scan (`/log/scan`)
There is no manual barcode entry. Render an EAN-13 PNG (inline encoder + Pillow works; the `barcode`
pip package may be missing), convert to y4m with ffmpeg, and launch headed Playwright Chromium with
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file.y4m>`.
Useful barcodes: `5260181590836` → OFF 404 (genuine miss), `3017624010701` → OFF 200 (Nutella).

## Forcing error paths from the DB (best way to prove error propagation)
`revoke delete on public.food_entries from authenticated;` → inline "Couldn't delete: permission denied…".
`revoke select on public.water_logs from authenticated;` (after logging water, without reloading) →
water Undo shows the read error instead of "Nothing to undo today.". Always `grant` back afterwards.
Blackhole OpenFoodFacts with `127.0.0.1 world.openfoodfacts.org` in `/etc/hosts` to test transport errors.

## Claude without a key
Run a tiny Anthropic-compatible HTTP server returning a fixed messages payload and set
`ANTHROPIC_API_KEY=stub-key` + `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`. Every Claude path
(log text, re-analyze, scan fallback) then works, but report the numbers as stubbed.

## Known environment limitations
- The `/settings` Notifications card can stay in its loading state because the service worker registers
  but never activates in this Chrome (`registration.active === null`), so "Enable notifications" /
  "Send test" never render and `sendTestPush` cannot be reached from the UI. With VAPID unset the card
  instead shows "Push notifications aren't configured (VAPID keys missing on the server)", which is
  still useful evidence. A workaround might be a fresh Chrome profile or a production build (`next build && next start`).
- Hydration warnings in the Next.js dev overlay mentioning `devin-hidden`, `devinid`, `devin-tagname`
  or `offscreen=""` come from the agent's DOM annotation tooling, not the app — check the diff before
  reporting them as bugs.
- Local setup may leave `supabase/config.toml` modified and `supabase/migrations/*` deleted in the
  working tree; never commit that.
