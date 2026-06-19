# Kcal-pal — manual QA checklist

What the automated suite can't cover: real Safari, real Chrome, and the
iOS home-screen PWA. Run through this on each surface after a deploy.
`✓` = works, responsive (fits `max-w-md`, no overflow), no console errors.

Surfaces:
- **S** = iPhone Safari tab
- **C** = desktop/Android Chrome
- **P** = iOS home-screen app (Add to Home Screen, standalone)

| Area | Check | S | C | P |
|---|---|---|---|---|
| **Auth** | Request code → email arrives with a 6-digit code (no link) | ☐ | ☐ | ☐ |
| | Enter code → lands on `/today` (or `/onboarding` first run) | ☐ | ☐ | ☐ |
| **Today** | Greeting, produce motif animates (or static under Reduce Motion) | ☐ | ☐ | ☐ |
| | Calorie ring + macro bars reflect today's logs | ☐ | ☐ | ☐ |
| | Oura / Weight / Water / Cycle cards render (or hide when no data) | ☐ | ☐ | ☐ |
| | Water quick-add (+8/+16/+20) updates total; undo works | ☐ | ☐ | ☐ |
| | "+ Log food" FAB → `/log` | ☐ | ☐ | ☐ |
| **Nav** | Each page shows the loading spinner briefly, never a blank flash | ☐ | ☐ | ☐ |
| **Log (text)** | Meal first → description box auto-grows as you type | ☐ | ☐ | ☐ |
| | Submit → entry parsed, macros + micros populated | ☐ | ☐ | ☐ |
| | Saved meals one-tap log; pantry chip fills box / ＋ logs instantly | ☐ | ☐ | ☐ |
| **Log (photo)** | Pick/take photo → parsed entry to confirm | ☐ | ☐ | ☐ |
| **Log (scan)** | Tab → **Start camera** tap prompts for camera (PWA) | ☐ | ☐ | ☐ |
| | Camera auto-starts in a Safari tab / Chrome (no extra tap) | ☐ | ☐ | ☐ |
| | Scan a barcode → OFF/Claude lookup → portion editor recalcs macros | ☐ | ☐ | ☐ |
| | Camera error (deny permission) shows the real reason + Try again | ☐ | ☐ | ☐ |
| **Summary** | Tap an entry → component breakdown; micros expand to contributors | ☐ | ☐ | ☐ |
| | Toggle **7-day average** → bars switch to daily-average vs goal | ☐ | ☐ | ☐ |
| | In average mode, expand shows top-5 weekly foods (table) | ☐ | ☐ | ☐ |
| | Food insights: Generate → two-paragraph note; Refresh re-runs | ☐ | ☐ | ☐ |
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
