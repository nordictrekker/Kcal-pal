---
name: testing-kcal-pal
description: How to run and end-to-end test the Kcal-pal Next.js app locally (env setup, prod build, reaching auth-gated pages without a Supabase session, faking a camera/barcode for the scanner, testing cron/API auth).
---

# Testing Kcal-pal locally

## Boot the app
- Node 24 is required (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`). Vitest/rolldown breaks on Node 20.
- There is no `.env.local` in the tree. A working test `.env.local` (no real secrets needed):
  ```
  NEXT_PUBLIC_SUPABASE_URL=<public URL from .github/workflows/ci.yml>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable anon key from ci.yml>
  SUPABASE_SERVICE_ROLE_KEY=dummy-service-role-key   # dummy is required or /api/health/ingest 500s in smoke
  ALLOWED_EMAIL=test@example.com
  HEALTH_INGEST_TOKEN=dummy-health-token
  CRON_SECRET=test-cron-secret-1234
  ```
- Response headers from `next.config.ts` `headers()` are baked into the build manifest, so test them with
  `npx next build && npx next start -p 3102`, not `next dev` alone. Editing `next.config.ts` does NOT affect an
  already-running `next start`; a `next dev` server on another port is a fast way to test an alternate header value.
- Long builds: run `next build` in a background shell (`timeout: 0`) and poll — a foreground call gets clamped
  and killed, leaving a stale `.next/BUILD_ID`. Same for `next start`: start it in its own persistent background
  shell, otherwise `nohup ... &` inside a timed-out call dies with the shell.
- Killing the background shell does NOT always kill `next-server`: after a rebuild, a stale server keeps serving
  the OLD build on the same port and silently invalidates results. Always confirm with `ss -ltnp | grep <port>`
  (and `kill <pid>`) before re-testing, and check the new server's log for `EADDRINUSE`.
- Route smoke: `node scripts/smoke.mjs http://localhost:3102` should print `PASS — 17/17 routes`.
- E2E: `npx playwright install --with-deps chromium`, then `E2E_PORT=3102 npx playwright test --project=chrome`
  (reuses the already-running server; the authenticated specs skip without `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`).
  Restrict to chromium projects (`--project=chrome --project=mobile-chrome`); the `safari`/`mobile-safari`
  projects fail on this box because WebKit needs system libs that `playwright install webkit` cannot add without
  root ("Host system is missing dependencies"). Those 14 failures are environmental, not app bugs — CI covers webkit.

## Sign-in is usually impossible in a sandbox
Login is email OTP restricted to `ALLOWED_EMAIL` (`app/login/actions.ts`), so no session is obtainable without
either a mailbox or a password-enabled account. Devin secrets that would unblock authenticated testing:
`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD` (a password-enabled allowlisted Supabase account) — with those, seed a
session via `tests/e2e/global-setup.ts` (it writes `e2e-auth.json` cookies usable in any browser).

## Reaching auth-gated UI without a session (temporary test scaffolds — always revert)
Everything except `/login`, `/auth/*`, `/api/health/ingest`, `/_next` is redirected to `/login` by
`lib/supabase/middleware.ts` (`isPublic` list), and pages re-check with `supabase.auth.getUser()`.
To exercise a gated client component signed out:
1. add the path to `isPublic` in `lib/supabase/middleware.ts`;
2. neutralise the page-level `if (!user) redirect("/login")` (e.g. `&& process.env.TEST_SCAFFOLD !== "1"`);
3. for components that live inside DB-heavy pages (e.g. `HomeBaseSearch` used by `/settings` + `/onboarding`),
   add a tiny public page that renders just that component instead of unlocking the whole page.
Revert with `git checkout` + rebuild, then re-run `scripts/smoke.mjs` to prove the gates are back (307s).

## Testing the barcode scanner (/log/scan) with no physical camera
The box has no `/dev/video*`, so launch a second Chrome with a fake device fed by a generated barcode video —
this makes html5-qrcode actually decode and fire the `lookupBarcode` server action:
```bash
pip install python-barcode                    # render an EAN-13 PNG (e.g. 3017620422003)
# IMPORTANT: html5-qrcode only decodes the central qrbox crop (scan-flow.tsx: min(320, 0.85*vw) x 0.25*vh),
# so a full-bleed barcode is cropped and NEVER decodes. Composite the barcode ~420x110 px, centred on a
# white 640x480 frame (PIL), then loop it for >=10 s:
ffmpeg -y -loop 1 -i barcode_frame.png -t 10 -r 15 -pix_fmt yuv420p -s 640x480 /tmp/barcode.y4m
DISPLAY=:0 setsid nohup /opt/.devin/chrome/chrome/*/chrome-linux64/chrome --no-sandbox --disable-gpu \
  --user-data-dir=/tmp/camchrome --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream --use-file-for-fake-video-capture=/tmp/barcode.y4m \
  --window-size=1600,1000 "http://localhost:3102/log/scan" >/tmp/camchrome.log 2>&1 </dev/null &
```
Use `setsid nohup ... </dev/null &` — a plain background launch dies when the exec call times out.
Then `wmctrl -i -a <id>` + `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`; close/ignore Devin's own
Chrome window first, otherwise computer-use keystrokes can land in the wrong window.
Navigation inside this window: `ctrl+l` then `type` works, but a bare `left_click` on the omnibox followed by
`type` sometimes drops `:` and `/` and turns the URL into a Google search — verify the address bar after typing,
or just re-run the chrome binary with the new URL (it opens a tab in the existing instance).
The decode + lookup happens in <2 s, so the live viewfinder is hard to screenshot; the decoded barcode shown in
the result panel is itself proof that getUserMedia succeeded. Drive this window with computer-use screenshots
(CDP/read_dom only works against Devin's own Chrome).
Useful control when testing `Permissions-Policy`: a build with `camera=()` makes the page show
"Camera couldn't start … NotAllowedError: Permission denied", which proves the header is genuinely enforced.

## Cron / API auth endpoints
Since commit c83e255 the middleware `isPublic` list includes `path.startsWith("/api/cron/")`, so `/api/cron/*`
reaches its own `CRON_SECRET` check and needs NO test scaffolding. On a clean prod build expect:
401 `{"error":"unauthorized"}` for missing / wrong / prefix-less / lowercase-`bearer` `Authorization`, and
500 `{"error":"server not configured"}` for the correct `Bearer $CRON_SECRET` when `SUPABASE_SERVICE_ROLE_KEY`
is a dummy (the 500 comes from the missing service key / VAPID config, i.e. auth already passed).
The trailing slash in the `isPublic` entry matters: verify `/api/cron` and `/api/cronx` still `307 -> /login`
whenever that list is edited, so the exemption can't be widened accidentally.
If a correct-bearer request unexpectedly returns `307 -> /login`, suspect a stale `next-server` on the port
serving a pre-fix build before concluding the code is broken.
Historic note: before c83e255 every cron request 307'd to `/login`, which meant the Vercel cron in `vercel.json`
never reached the handler in production — a good class of bug to check for any token-authed API route.

## Vercel preview deployments
Preview URLs for this project are behind Vercel SSO: `curl` returns `302` to `vercel.com/sso-api`, so they are
not usable for verifying app response headers (the SSO response only carries a subset). Use a local
`next build && next start` as the authoritative header check.

## Typing quirk
`type`-ing an `@` via computer-use can be dropped; type the local part, send `key` `at`, then the domain.
