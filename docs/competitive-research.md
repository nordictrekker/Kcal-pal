# Competitive & evidence research — June 2026

Research into nutrition/recovery apps to inform Kcal-pal's roadmap. Compiled
from multi-source web research (Cal AI, MacroFactor, MyFitnessPal, Lose It,
Cronometer, Zoe, Lumen, Noom, Oura, Whoop, and women's cycle apps). Marketing
claims are flagged separately from verified evidence throughout.

## TL;DR — where Kcal-pal should play

The clearest defensible wedge for an **Oura + cycle + AI-logging** app is the
**recovery/alcohol → nutrition + hydration feedback loop**. Activity add-back,
meal photos, CGM, and AI chat advisors are all becoming table-stakes (Oura and
Whoop already ship them). Differentiation comes from **fusing** recovery +
cycle + alcohol + hydration into next-day actions, and from being
**evidence-honest** in a hype-saturated category.

## The competitive landscape

### Adaptive calorie targets
- **MacroFactor** is the only true adaptive-TDEE engine. It *measures*
  expenditure from logged intake vs. trend-weight change (not a BMR formula),
  over a **~21-day window**, with **trend-weight smoothing** and a **coaching
  throttle** so weekly target changes don't scale 1:1 with noise (illustrative:
  caps a ~500 kcal swing down to ~200–300). It explicitly **detects partial
  logging** (under-logged days bias expenditure down — "you can't out-log your
  metabolism") and lets users exclude them. Self-reported accuracy; transparent
  but not independently audited. No free tier; ~$72/yr.
- **MyFitnessPal** and **Lose It!** are static-formula trackers (recompute only
  when you change inputs). MFP shipped an AI "Coach" (June 2026) grounded in
  diary data — a chatbot layer, not adaptive TDEE. MFP also **acquired Cal AI**
  (closed Dec 2025).
- **Lose It!** has weekend calorie-banking and DNA (AncestryDNA) diet insights.

### AI photo logging — accuracy reality
- Independent benchmarks: **MFP Meal Scan ~71% food-ID, ±18% portion error**;
  **Lose It Snap It ~69% ID, ±22% error, ~11s latency**. Cal AI markets
  "90–95%" but that conflates *recognition* with *calorie* accuracy and is
  unaudited; hands-on tests show **25–50% under-counting on complex/mixed
  meals** (a camera can't see oil, sauce, or how much was eaten).
- Peer-reviewed: AI estimates ran ~**695 kcal/day lower than dietitians**
  (Frontiers in Nutrition 2026). Portion/volume is the persistent failure mode.
- **Implication for us:** photo-only will never be precise. Our text + history
  personalization is a sound bet; keep photo expectations honest and lean on
  editable breakdowns + "[user-corrected]" learning.

### Wearables moving into nutrition (the threat + the playbook)
- **Oura** now ships **Meals** (AI photo → non-judgmental protein/fiber/added-
  sugar/processing breakdown), **Advisor** (AI chat over your data, with a
  women's-health LLM added Apr 2026), and **glucose via Dexcom Stelo** (and
  acquired metabolic-coaching co. Veri). Much of "log a meal, get a score" is
  becoming table-stakes *inside Oura itself*.
- **Whoop** ships an OpenAI-powered Coach (nutrition coaching, memory) and
  **Advanced Labs** (blood biomarkers incl. glucose/insulin/HbA1c).
- **Recovery-adjusted nutrition is near-white-space.** Almost everyone adjusts
  for *activity* (add-back active calories: KCALM, Nutrola, Fuel). Very few
  adjust for *recovery* — **Humuli** (HRV+sleep-aware) is the lone clear
  example. Science supports it: calorie deficits and under-fueling depress HRV;
  HRV drops 10–20% after hard training and should rebound in 24–48h.

### Alcohol & hydration (our existing strengths)
- Oura's own data: alcohol nights show **HRV −~15%**, RHR +~8%, ~35 min less
  sleep, and effects can linger **4–5 days**. Caffeine is *not* meaningfully
  dehydrating; alcohol *is* a diuretic (raises hydration need). We already
  model the hydration side — adding a **next-day recovery prediction** ("last
  night's drinks may show as low readiness") would extend this lead.

### Micronutrients & glucose
- **Cronometer** = gold standard for micros (84 nutrients, lab-verified
  database). We track only macros + fiber — a gap, especially for
  cycle-relevant nutrients (iron, calcium, magnesium, vitamin D, omega-3).
- **OTC CGMs are now cheap & prescription-free**: Dexcom **Stelo (~$89–99/mo)**,
  Abbott **Lingo (~$49/2wk)**. January AI's "digital twin" predicts glucose
  response *before* eating from ~14 days of sensor training.

### Behavioral / cycle apps
- **Noom**: psychology-first, daily micro-lessons (CBT/ACT/DBT), green/yellow/
  red food color system. Real but largely self-funded weight-loss evidence;
  criticized for ~1,200-kcal defaults & disordered-eating risk.
- **Zoe**: personalized per-food score from gut microbiome + blood-fat + CGM;
  PREDICT study (Nature Medicine 2020) genuinely shows postprandial responses
  vary 68–103% between people. Plant-diversity goals, processed-food risk
  scale, "predict-from-questionnaire" cold start. Glucose-spike-avoidance for
  *healthy* people is unsettled science.
- **Women's cycle apps**: Wild.AI (birth-control-aware across 148 types, Oura
  sleep/RHR ingest, fuel-around-training), FitrWoman (elite-sport pedigree,
  coach companion), 28/Flo/Clue/MyFLO (mostly content + tracking).

## Cycle-phase nutrition: evidence vs. hype (important for our positioning)

**Reasonably supported:**
- Luteal RMR rises modestly (older studies ~8–9%/150 kcal; newer studies
  smaller/often non-significant). Energy intake & cravings rise in luteal
  (progesterone up, estrogen's appetite-suppression down) — honoring a small
  intake/protein bump late-cycle is defensible.
- Symptom-targeted nutrition has real support (calcium, vit D, zinc, magnesium,
  omega-3 for PMS; iron around menses).

**NOT well supported (marketing ahead of evidence):**
- **Phase-based training periodization** shows no proven benefit over standard
  programming (multiple 2023–2025 reviews).
- The rigid "eat raw in ovulation / fermented in follicular" food chart has
  essentially no clinical evidence; much cycle-syncing content is produced by
  people selling supplements.

**Our edge:** we already compute **N-of-1 personal phase baselines** (her own
appetite/sleep/recovery by phase) — which sidesteps the "every woman differs"
critique that invalidates generic phase charts. Leaning into personal patterns
+ evidence-honesty is a genuine trust moat.

## Prioritized feature ideas

Biased toward our strengths (cycle + Oura + AI logging) and things we don't
already have. Difficulty: L/M/H.

1. **Recovery-adjusted targets** (M) — on low Oura-readiness / poor-HRV /
   hard-training days, nudge calories & carbs *up* to protect recovery. Biggest
   differentiator; we already have the Oura data and insight scaffolding.
2. **Evidence-confidence labels** on insights/recommendations (L) — "strong:
   iron around menses" vs "exploratory: phase-based macros." Cheap trust moat;
   nobody does it.
3. **Conversational AI advisor over our fused data** (M/H) — chat that reads
   cycle + Oura + nutrition + alcohol + hydration together. Becoming
   table-stakes (Oura/Whoop/MFP); our differentiation is the data fusion.
4. **Adaptive-TDEE upgrade** (M) — evolve the new rolling balance toward
   MacroFactor rigor: weight-trend-based expenditure, ~14–21d window,
   smoothing, and **partial-logging detection** (don't let under-logged days
   crater the target). We already store weight trend.
5. **Cycle-relevant micronutrients** (M) — add iron, calcium, magnesium, vit D,
   omega-3 (not all 84 like Cronometer). Fills a gap, cycle-relevant, the AI
   already estimates some.
6. **Symptom-targeted nutrition library** (L/M) — PMS → calcium/D/zinc/Mg;
   menses → iron, framed as food suggestions. Best-evidenced lever.
7. **Plant-diversity / positive additive goals** (L) — "30 plants/week" streak;
   healthier, non-restrictive framing (Zoe).
8. **Weekly check-in flow** (M) — review the week, confirm/adjust targets,
   surface one pattern. Retention driver (MacroFactor/Noom).
9. **Photo logging: history personalization** (L) — extend the
   "[user-corrected]" learning we added for text to the photo path too.
10. **OTC CGM integration** (H, later) — Stelo/Lingo overlay glucose on meals +
    sleep; premium-tier differentiator. Frame glucose as exploratory, not
    diagnostic.
11. **Anti-restriction / RED-S guardrails** (L) — keep proactively flagging
    under-fueling (we already do) rather than encouraging premenstrual dieting.
    Safety + credibility differentiator dietitians endorse.

## Guardrails learned (applied to our rolling balance)
- Cap the magnitude (we cap ±300 kcal) and offset only a *fraction* of the
  drift (we use 0.5) — avoid the "caloric roller coaster."
- Use a multi-day window and only adjust with enough logged days (we require
  ≥3) — a single binge/fast shouldn't whip the target.
- **Open risk:** partial/under-logging looks like a deficit and would wrongly
  *raise* today's target. MacroFactor's answer is explicit partial-log
  detection. Worth adding (e.g., ignore days under ~50% of typical intake).
</content>
