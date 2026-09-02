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

---

# Re-evaluation — 2026-09-02 (n=1, 84-day span)

Second pass against the same lens. The July priorities shipped (one-tap
re-log, pantry chips, lapse nudge, supplement research, five accuracy fixes),
so this asks what the data says *now*.

## What changed since July

| Signal | Jul 4 | Sep 2 | Reading |
|---|---|---|---|
| Days logged, rolling 14d | 0 of last 5 (lapsed) | **7 of 14 (50%)** | The lapse broke. P0 worked. |
| This week | — | **3 of 3 days** | Currently the most consistent stretch on record. |
| Entries / logged day | 9 → 2 (tapering) | **5.5, stable** | Within-day completeness is no longer the problem. |
| Meal coverage | — | breakfast 14 · lunch 14 · dinner 14 · snack 16 days | Balanced. Dropouts are whole-day, not partial-day. |
| Saved meals used | 0 | 3 (each used once) | Now used — though the feature dropped micros until PR #35. |
| Hand-edit rate | 33% | **42%** (see caveat) | Did not improve. |
| Photo entries edited | 4/4 | **5/5 (100%)** | Photo is still not trusted. Unchanged in two months. |

**Caveat on the edit rate:** `edited_by_user` is set both when the user
corrects an entry and when an operator repairs one from a bug report. Several
recent repairs were mine (lasagna, chicken plate, egg yolk, seduction loaf,
egg-white wrap, Berocca). So 42% is an upper bound, not a clean read, and the
accuracy work can't be judged by it as things stand. **Fix the instrument
before trusting the number:** separate operator repairs from user corrections
(a `corrected_by` column, or a distinct flag) so this metric means one thing.

## The finding that changes the strategy

> **105 entries, 101 distinct descriptions — a 4% exact-repeat rate.**
> At component level: 235 mentions, 199 distinct (15% repeat). The most-eaten
> single food is banana, at 5 mentions across 19 logged days.

Every accelerator built so far — saved meals, pantry chips, "log again",
"copy yesterday" — pays off in proportion to how often the same thing is eaten
twice. This user is a **variety eater**, so that entire family of features has
a low ceiling for her no matter how well it is executed. It was the right bet
on July's data and it did break the lapse; it is not where the next win is.

Near-duplicates also don't cluster: "double espresso" / "brewed coffee" /
"coffee with skim milk" are three rows; so are "broccoli" / "raw broccoli" and
"skim milk" / "2% milk". Even the 15% component repeat overstates what the
current exact-match grouping can actually capture.

The corollary: **almost every entry is a first-time capture.** 87 of 105
entries were composed as free text. That is the real per-entry cost, and it is
paid ~5.5 times a day.

## Revised priorities

### P0 — make first-time capture cheap

1. **Make photo work.** It is the only modality that skips composing entirely,
   and it is the one with a 100% edit rate across two months and 9 entries.
   The July read ("the fix is an easier correction step, not a better model")
   is still the right diagnosis and still unbuilt: portion slider, per-component
   remove/adjust, and a visible confidence signal so a good parse is accepted
   without a round trip through the editor.
2. **Voice capture on `/log`.** Speaking "half an avocado, three egg whites and
   a seduction loaf" is materially cheaper than typing it, and it suits a
   variety eater exactly where chips do not. Web Speech API on Chrome/Android,
   `<input capture>` dictation fallback on iOS Safari.
3. **Fix the edit-rate instrument** (above). Without it, none of the accuracy
   work is measurable, and accuracy is the second-biggest friction source.

### P1

4. **Fuzzy component clustering** — fold "raw broccoli"/"broccoli" and the
   three coffees into one pantry entry. Raises the ceiling of the accelerators
   already built, cheaply, without new UI.
5. **Portion scaling on re-log** — a saved meal is a fixed portion today; ×0.5 /
   ×2 at log time removes the edit-after-the-fact step.
6. Passive-first devices; one-line insights. Unchanged from July.

### Still not now

Adaptive luteal targets, recipes, meal planning, deeper dashboards, PCOS /
perimenopause segmentation — all unchanged from July's reasoning. Adherence is
recovering but not yet durable, and n is still 1.

## Measures of success

Unchanged, except the edit-rate target is on hold until the instrument
distinguishes user corrections from operator repairs.

- Days-logged ratio (rolling 14d) — **50% now**, target >70%.
- Hand-edit rate on new entries — *unmeasurable as specified*; fix first.
- Photo entries accepted without edit — **0% now**, target >50%.
- Median taps to log a *novel* meal — the metric that matters for this user.

## Operational note (recurring problem, now fixed properly)

July's doc recorded deleting the E2E smoke bug-reports by hand. Nothing stopped
them recurring: by 2026-09-02 the table held **493 rows, 492 of them E2E
submissions**, burying the single genuine user report. Migration 0030 purged
them and added an own-row delete policy; a Playwright global teardown now
removes what the smoke test writes on every run. Manual cleanup of a recurring
process is not a fix — the teardown is.
