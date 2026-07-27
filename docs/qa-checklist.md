# Kcal-pal — manual QA checklist

What the automated suite can't cover: real Safari, real Chrome, and the
iOS home-screen PWA. Run through this on each surface after a deploy.
`✓` = works, responsive (fits `max-w-md`, no overflow), no console errors.

Surfaces:
- **S** = iPhone Safari tab
- **C** = desktop/Android Chrome
- **P** = iOS home-screen app (Add to Home Screen, standalone)

_Pass 1 (2026-07-26, reported by Julie): Auth, Today, Nav, Log (text), and Summary verified ✓ on all three surfaces. Remaining: Log (scan) and later sections. Log (photo): ✓ on Chrome; on S/P the confirm page rendered a blank photo (object-URL revocation bug — fixed, ↻ = re-test) and offline PWA launch showed the raw browser error (offline fallback added, re-test the PWA offline row)._

| Area | Check | S | C | P |
|---|---|---|---|---|
| **Auth** | Request code → email arrives with a 6-digit code (no link) | ✓ | ✓ | ✓ |
| | Enter code → lands on `/today` (or `/onboarding` first run) | ✓ | ✓ | ✓ |
| **Today** | Greeting, produce motif animates (or static under Reduce Motion) | ✓ | ✓ | ✓ |
| | Calorie ring + macro bars reflect today's logs | ✓ | ✓ | ✓ |
| | Oura / Weight / Water / Cycle cards render (or hide when no data) | ✓ | ✓ | ✓ |
| | Water quick-add (+8/+16/+20) updates total; undo works | ✓ | ✓ | ✓ |
| | "+ Log food" FAB → `/log` | ✓ | ✓ | ✓ |
| **Nav** | Each page shows the loading spinner briefly, never a blank flash | ✓ | ✓ | ✓ |
| **Log (text)** | Meal first → description box auto-grows as you type | ✓ | ✓ | ✓ |
| | Submit → entry parsed, macros + micros populated | ✓ | ✓ | ✓ |
| | Saved meals one-tap log; pantry chip fills box / ＋ logs instantly | ✓ | ✓ | ✓ |
| **Log (photo)** | Pick/take photo → parsed entry to confirm | ↻ | ✓ | ↻ |
| **Log (scan)** | Tab → **Start camera** tap prompts for camera (PWA) | ☐ | ☐ | ☐ |
| | Camera auto-starts in a Safari tab / Chrome (no extra tap) | ☐ | ☐ | ☐ |
| | Scan a barcode → OFF/Claude lookup → portion editor recalcs macros | ☐ | ☐ | ☐ |
| | Camera error (deny permission) shows the real reason + Try again | ☐ | ☐ | ☐ |
| **Summary** | Tap an entry → component breakdown; micros expand to contributors | ✓ | ✓ | ✓ |
| | Toggle **7-day average** → bars switch to daily-average vs goal | ✓ | ✓ | ✓ |
| | In average mode, expand shows top-5 weekly foods (table) | ✓ | ✓ | ✓ |
| | Food insights: Generate → two-paragraph note; Refresh re-runs | ✓ | ✓ | ✓ |
| **Reanalyze** | `/reanalyze` → "Re-analyze all N" → progress + before/after | ☐ | ☐ | ☐ |
| **Recipes** | Paste URL → parsed recipe saved; servings stepper scales macros; Log | ☐ | ☐ | ☐ |
| **Weekly** | Digest Generate/Refresh; range tabs (14/30/90); charts render | ☐ | ☐ | ☐ |
| **Recap** | 90-day report; Save as PDF (print) and Email (mailto) | ☐ | ☐ | ☐ |
| **Settings** | Edit profile/targets/phase modifiers persist; theme toggle | ☐ | ☐ | ☐ |
| | Install card; notifications (VAPID) permission + test push | ☐ | ☐ | ☐ |
| **PWA** | Installs to home screen; opens standalone; offline shows a page | ☐ | ☐ | ☐ |

## Known surface-specific behavior
- **iOS PWA camera** requires the explicit *Start camera* tap (standalone
  mode blocks auto-start). If permission was denied, delete & re-add the
  home-screen icon to re-prompt.
- **No `BarcodeDetector` on iOS Safari** → the scanner uses the lazy-loaded
  html5-qrcode decoder; Android Chrome uses the fast native detector.
- **Sign-in is a 6-digit code, never a link** (mail scanners burn link
  tokens). The email template must contain only `{{ .Token }}`.

## Responsiveness
Every page is `max-w-md` (recap is `max-w-2xl`). Check no horizontal scroll,
tap targets ≥ ~40px, and that long entry text wraps rather than overflows.

## Automated route smoke test
`npm run smoke` (against a running `next start`, with a Supabase-pointed
`.env.local`) verifies every route's status without a browser or session:
public pages 200, gated pages 307 → `/login`, ingest API 401. Latest run:
**17/17 routes pass.** This covers routing/auth-gating; the interactive
feature checks above still need a real browser/device.

## Automated browser E2E (Playwright)
`npm run e2e` runs the `tests/e2e` suite on **Chromium (Chrome) and WebKit
(Safari)**, desktop + iPhone/Pixel viewports — login render, signed-out
redirects, mobile no-overflow, per-page TTFB, and **PWA installability**
(`pwa.spec.ts`: manifest is `standalone` with valid 192/512/maskable icons that
actually serve, plus the iOS home-screen head tags — `mobile-web-app-capable`,
`apple-touch-icon`, manifest link — present and resolving). Latest CI run: **66
passed** on the four engines (42 authenticated specs skip until the secrets
below are set). The authenticated specs
(today card, log form, 7-day toggle, LDL group) run automatically when
`E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` (a password-enabled account) are set as
CI secrets — `tests/e2e/global-setup.ts` seeds a real session via
`@supabase/ssr` so **every authenticated feature is exercised on Chrome +
Safari too**; without those secrets they skip and CI stays green. Runs in CI
(`.github/workflows/ci.yml`, which installs the browsers); locally after
`npx playwright install`. This is the cross-browser engine coverage; the manual
checks above remain for real-iPhone-Safari/PWA quirks (e.g. the standalone-PWA
camera) that Playwright's WebKit can't fully reproduce.
