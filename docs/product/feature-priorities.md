# Feature priorities — evaluated against real usage (2026-07-04)

What to build next, decided by two inputs: the competitive research
([`docs/research/competitive-brief.md`](../research/competitive-brief.md)) and
**measured usage of the one real account** (Jun 11 – Jul 4). The lens, per
product direction: minimize friction to log food, integrate devices, and get
*usable* insights — complex insights and over-specific advice are friction, not
value.

## What the usage data actually says

| Signal | Number | Reading |
|---|---|---|
| Days with any log | **10 of 19** span days; **0 of the last 5** | Logging decays: streaks taper (9 → 2 entries/day), then gaps. Currently lapsed. |
| Entries hand-edited | **15 / 45 (33%)** | Estimate-trust friction. Every edit is rework the user shouldn't need. |
| Photo entries edited | **4 / 4 (100%)** | Photo parse isn't trusted at all yet. |
| Modality mix | text 39 · photo 4 · barcode 2 | Text is the workhorse; the "fast" modalities aren't yet. |
| Saved meals / pantry / recipes used | **0 / 0 / 0** | The repeat-meal accelerators exist but require setup — nobody does setup. |
| Water quick-add taps | 29 | One-tap actions get used. |
| Oura days synced | 33 (passive) | Passive integrations stick; manual ones don't (1 weight entry ever). |
| Cycle days logged | 2 | Cycle features are aspirational right now, not habitual. |
| Real bug reports | 0 (12 E2E smoke rows cleaned) | Report button live; keep triage queries filtered to real users. |

**The one-sentence diagnosis:** things that take one tap or zero taps (water,
Oura) get used; anything that requires composing text, correcting an estimate,
or doing setup decays within a week — and the account is currently in a
5-day lapse. Retention of the *logging habit* is the bottleneck; nothing else
matters until re-entry is effortless. This matches the research's #1 finding:
logging fatigue, not motivation, is why people quit (competitive brief §4).

## Priorities

### P0 — attack the lapse/decay loop (build next)

1. **Zero-setup repeat logging: "copy yesterday" / one-tap re-log from
   history.** Saved meals sit at zero because saving is setup. Instead, mine
   what's already logged: on `/log`, show the last few distinct meals as
   one-tap chips ("Log again"), and on an empty day offer "copy yesterday's
   breakfast/lunch/dinner". No new data model — it's a query over
   `food_entries`. (Research: top requested speed feature across MFP/Cronometer;
   Lose It's model.)
2. **Kill the 33% edit rate — trust the numbers.**
   a. Extend the existing web-search parse path (today it's restaurant-only) to
   **branded/packaged/supplement items**, honouring the region/variant in the
   text (the French-Berocca case).
   b. **Micronutrient editing** in the entry editor as the backstop — today
   vitamin D etc. can't be corrected at all, only calories/macros.
3. **Lapse re-entry nudge.** Push infra already exists. One gentle notification
   after a missed day: "10-second log — copy yesterday?" Deep-link into the
   one-tap flow from (1). Adherence-neutral tone (MacroFactor lesson: no guilt),
   never more than one per day.

### P1 — after P0 lands

4. **Photo-parse confidence + fast portion adjust.** 4/4 edits says the fix is
   an easier correction step (portion slider, component removal) more than a
   better model.
5. **Passive-first device posture.** Oura proves passive wins. Weight via
   Oura/Apple Health import rather than a manual card; keep manual as fallback.
6. **Keep insights one-line and actionable.** The current phase/target/recovery
   notes are the right shape. Resist dashboards. The weekly digest (3 generated)
   is the ceiling of complexity for now.

### Explicitly not now (and why)

- **Adaptive luteal-phase targets** (research #5): highest differentiation on
  paper, but usage shows cycle features barely touched (2 days logged) and the
  core habit is lapsing. Differentiation is worthless without retention. Revisit
  once logging sticks (and cycle data accumulates via Oura passively).
- **Recipes / meal planning / offline / deeper micronutrient dashboards:**
  setup-heavy or complexity-adding — the opposite of the current bottleneck.
- **PCOS / perimenopause expansion:** n=1; premature segmentation.

## Measures of success (repeatable, cheap)

- Days-logged ratio (rolling 14d) — target >70% from ~50%.
- Hand-edit rate on new entries — target <15% from 33%.
- Median taps to log a repeat meal — target 2 (open `/log`, tap chip).
- Lapse length after a missed day — target: next-day return.

## Operational notes

- E2E CI runs against the production database as `e2e-bot@kcalpal.test`; its
  smoke bug-reports were deleted 2026-07-04. When triaging `bug_reports`,
  always exclude that account. If E2E ever starts writing food entries, give it
  a dedicated cleanup step.
