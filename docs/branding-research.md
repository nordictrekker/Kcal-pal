# Branding & signature-animation research — June 2026

Multi-source research into logo conventions (nutrition apps, women's-health/cycle
apps, recovery wearables) and beloved app micro-animations, to pick an ownable
logo + one signature in-app moment.

## The cliché map (what to avoid)
Across **both** categories, the same tired symbols recur:
- **Nutrition apps:** apple, leaf, flame; **orange & green** are crowded
  (Cronometer, Lose It, Noom, Lifesum, Foodvisor). Lifesum is *retreating* from
  its apple — a sign the trope is dated.
- **Women's-health apps:** **flowers/lotus/petals, soft pink/pastel, moons/
  crescents, droplets, hearts.** The lotus/flower is the universal spa/yoga/
  beauty shorthand; the moon is now *nearly as crowded as flowers* (Stardust,
  28, Moonai, Lunari, …).

So a generic bloom/lotus (our current mark) sits squarely in the spa cliché.

## What the breakout brands do
Premium credibility comes from **typographic confidence + crisp geometry + a
non-pastel palette**, not decoration:
- **Clue** — bold menstrual **red** + plain wordmark (clinical/empowered).
- **MacroFactor** — black/white **"M" monogram** (Pentagram). "Inspired science."
- **ZOE** — typographic **"Z"** with a negative-space cut, warm yellow.
- **Wild.AI** — sharp **diamond/geometric**, anti-"soft/fragile."
- **Whoop/Garmin/Oura** — mono wordmark / triangle / ring; zero florals or pink.
- **Yuka** — a **face/head** silhouette (white space: it's about *you*, not produce).

## Recommendation — logo
A **combination mark**: a confident **serif wordmark** ("kcal pal", lowercase,
no hyphen — the unit `kcal` stays lowercase-correct) paired with **one
distinctive symbol**. For the symbol, ranked:

1. **Pomegranate** (recommended). The single botanical that is BOTH food *and*
   the classic fertility/cycle symbol (Persephone myth), warm in our clay
   palette, and essentially unused by competitors → highly ownable. Tells the
   "nutrition × cycle" story no apple/leaf/lotus can.
2. **Serif "k" lettermark** — the MacroFactor/ZOE lane: premium, scalable,
   trademark-safe, zero cliché. Safest, most "credible," least warm.
3. **Sprout/seedling** — clean "nourishment + growth," modern; less
   differentiated than the pomegranate.

Avoid: lotus/5-petal bloom, apple, leaf, flame, moon/crescent, soft pink, heart,
droplet.

## Recommendation — one signature animation
**A growing botanical that ripens/blooms with the day and fruits on goal** —
fusing the three best precedents into a calm, on-brand whole:
- Oura's "one meaningful state," Apple Rings' screenshot-worthy *closure payoff*,
  Finch's gentle *additive* growth — **minus** Forest's loss-aversion and
  Duolingo's high-energy gamification.
- It should share the logo's shape language: if the logo is the pomegranate, the
  motif is a bare branch that **buds → flowers → ripens a pomegranate** as
  calories approach the goal (the in-app moment literally becomes the logo).

**Two supporting micro-interactions:**
1. A single thin **progress orbit** around the motif (`pathLength` 0→1) — the
   proven at-a-glance "how close am I," kept to one ring so it reads calm.
2. A subtle **phase/time-aware ambient tint** (gradient shift by cycle phase or
   time of day) — "the app knows me," reduced-motion-safe (color/opacity only).
Keep the existing count-up on the hero number; reserve any liquid-fill strictly
for the literal hydration metric.

## Implementation notes
- Add **Framer Motion** (not yet installed). Growth = `scale`/`pathLength` +
  `staggerChildren`; orbit = `motion.circle` `pathLength`; count-up =
  `useMotionValue` + `animate()`.
- Wrap in `<MotionConfig reducedMotion="user">` + `useReducedMotion()`; under
  reduced motion, cross-fade growth stages instead of scaling, and snap count-ups.

## Sources
Cycle/nutrition/wearable brand pages (Clue, Flo, Stardust, Wild.AI, Natural
Cycles, MacroFactor/Pentagram, ZOE/Ragged Edge, Cronometer, Yuka, Noom),
Apple Fitness rings, Oura readiness, Headspace, Finch, Forest, Duolingo, Arc;
prefers-reduced-motion (MDN, Tatiana Mac), Motion docs. (Full URLs captured in
the research transcripts.)
