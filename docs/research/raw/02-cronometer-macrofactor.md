I have comprehensive material across 16+ searches and multiple fetch attempts. I have enough to compile a detailed structured writeup. Note: Reddit and most blog/forum pages returned HTTP 403 / blocked direct fetching, but the search engine surfaced verbatim-level content from those sources, which I attribute by URL.

---

# Findings: What Users LOVE, HATE, and REQUEST about Cronometer & MacroFactor

**Method note / source reachability:** I ran ~17 web searches. Direct WebFetch was blocked (HTTP 403 or hard-blocked) on every Reddit URL, the Cronometer official forums (forums.cronometer.com), the trygaya/nutrola/promealplan review blogs, the App Store pages, businesswire, and macrofactor.com. So I could not pull raw page HTML. However, the search engine surfaced verbatim/near-verbatim snippets from those same pages, which I attribute below by URL. Treat quotes drawn from search snippets as "reported verbatim" rather than independently re-fetched. Reddit's own threads (r/Cronometer, r/macrofactor, r/xxfitness) were not directly retrievable; most community sentiment below comes from the Cronometer official forums and aggregator review articles that quote users.

---

## CRONOMETER

### What users LOVE
- **Micronutrient depth (the flagship reason).** Tracks 80+ micronutrients (vitamins, minerals, amino acids), far beyond macros. Widely called "the gold standard for micronutrient tracking" and "the app you graduate to if you're serious about your nutrition." (https://calorie-trackers.com/reviews/cronometer/, https://www.cal33.com/blog/cronometer-vs-myfitnesspal)
- **Database accuracy / curated sourcing.** Data comes from NCCDB, USDA, and verified manufacturer entries rather than crowd-sourced guesses. In a published 30-item comparison vs USDA reference values, Cronometer matched 30/30 within 5%, vs MyFitnessPal at 11/30; cited at ~±3.5% calorie accuracy. ~1.2M database entries. Crucially, users can't add foods instantly — submissions require photo of label + package front and pass a curation team. Users specifically switch because MFP doesn't track e.g. Magnesium (not required on US labels). (https://www.promealplan.com/en/blog/cronometer-vs-myfitnesspal, https://cronometer.com/blog/my-fitness-pal-to-cronometer/)
- **Nutrient targets + the "Oracle" (Gold).** "Ask the Oracle" / Nutrient Oracle suggests foods to fill nutrient gaps for the day (e.g., low potassium but at 90% carbs → suggests foods that fit), rankable per gram / per calorie, with like/dislike tuning and diet filters. Repeatedly cited as the reason Gold is worth it. (https://forums.cronometer.com/discussion/comment/10772, https://forums.cronometer.com/discussion/880/ask-the-oracle-to-rank-the-lowest-amount-per-gram-calorie)
- **Auto net-carbs and one-click macro %.** Tracks net carbs automatically (MFP doesn't) and shows macro percentages with one click. (https://www.katelymannutrition.com/blog/cronometer-vs-mfp)
- **Existing nutrient-contributor view.** Tapping a target/nutrient bar shows the top contributing foods for that nutrient that day — a beloved "which foods gave me X" view already in the mobile Daily Report. (https://support.cronometer.com/hc/en-us/articles/32689033683220-Mobile-Daily-Report)

Representative loved quote: *"The Gold membership is very worth it if optional nutrition is your main concern as the Oracle recommendations help you fill gaps."* (App Store review, via https://forums.cronometer.com/discussion/comment/10772)

### What users HATE
- **Clunky / wasteful redesigned UI (most frequent complaint).** Thread literally titled "cronometer experience is a mess." Users say the new interface is "too zoomed in," has "too much negative space," "wasted space," and requires far more scrolling than the old version to see nutrients — described as tedious. (https://forums.cronometer.com/discussion/5176/cronometer-experience-is-a-mess)
- **Logging friction / micro-annoyances.** "Add Serving" menu jumps around when the keyboard pops up; harder to distinguish native vs custom foods after custom-food color changed from high-contrast blue to faint green; reports of mobile app showing a blank black screen. (forums.cronometer.com pet-peeves thread, https://forums.cronometer.com/discussion/comment/14480)
- **Steep learning curve / information overload.** "Most people aren't concerned about micronutrients, and could be overwhelmed by the amount of information." Casual users find the density and learning curve off-putting. (https://www.katelymannutrition.com/blog/cronometer-vs-mfp)
- **Barcode/database friction.** Smaller, slower-to-grow barcode database because additions are curated, not instant; entering a barcode while creating a custom food doesn't search the DB. (forums.cronometer.com help threads)
- **Pricing/paywall resentment + "nickel-and-diming."** Users frustrated that prices rose "while delivering little substantive improvement," and that features "initially free to use" moved behind the paywall. Demand for an API instead of "silly gimmicks" (e.g., the Men's Health Nutrition Score notification was called out as an unwanted gimmick). (https://forums.cronometer.com/discussion/3712/paywall, https://forums.cronometer.com/discussion/5176/cronometer-experience-is-a-mess)

Representative hated quotes: *"cronometer experience is a mess"* (thread title, https://forums.cronometer.com/discussion/5176/...); used to be good but they *"decided to require payment for things that were initially free to use"* (https://forums.cronometer.com/discussion/3712/paywall).

### Repeatedly REQUESTED features
- Offline mode (https://forums.cronometer.com/categories/feature-requests)
- Meal plan builder + grocery-list generator (https://forums.cronometer.com/discussion/comment/5203)
- Food/meal **import** (e.g., simple JSON upload to pre-fill entries) and recipe import improvements (https://forums.cronometer.com/discussion/comment/20509)
- Public **API** (recurring, strongly wanted) (https://forums.cronometer.com/discussion/5176/...)
- Barcode-scanned foods appearing in text-search history like manually searched foods (https://forums.cronometer.com/discussion/6965/barcode-scanned-foods-should-appear-in-text-search-history-like-manually-searched-foods)
- Better fitness/exercise module — add exercise via sets/reps; exercise/Apple Health sync fixes (https://forums.cronometer.com/discussion/1397/..., https://forums.cronometer.com/discussion/2412/need-to-be-able-to-add-exercise-via-sets-reps-please)
- Blood sugar and fluid tracking (forums.cronometer.com feature-requests)

### Pricing
Gold is ~$9.99/mo or ~$54.99/yr. Sentiment is mixed-to-grudging: worth it for serious micronutrient users (Oracle, recipe importer, meal grouping, unlimited history, partner discounts like WHOOP/Oura), but the free→paid feature migration and price hikes generate resentment. One user who let Gold lapse "immediately missed the simple meal grouping." (https://cronometer.com/gold, https://forums.cronometer.com/discussion/comment/9823)

---

## MACROFACTOR

### What users LOVE
- **Adaptive TDEE / expenditure algorithm (the #1 reason, near-universally praised).** Continuously recalculates real daily energy expenditure from logged food + weight trend instead of a static formula, so targets auto-adjust as metabolism changes during a cut/bulk → "so you never plateau." Built by Stronger By Science. A year-long Reddit writeup: *"MF is awesome. It's better at calorie tracking than any other app on the market, and its TDEE estimation algorithm is very accurate."* (https://www.trygaya.com/review/macrofactor-review, https://nutrola.app/en/blog/why-is-macrofactor-so-expensive)
- **"Adherence-neutral" algorithm.** It doesn't punish imperfect tracking; if you overeat one week it recalculates from actual results rather than judging compliance — users love that it isn't guilt-driven. (https://nutrola.app/en/blog/why-is-macrofactor-so-expensive)
- **Weight-trend smoothing.** "Cuts through the noise of daily fluctuations" with a trend-weight insight used to drive weekly check-ins. (App Store listing; https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471)
- **Fastest food logging + no ads.** Markets "the fastest food logger in the world"; multiple logging modes (search, barcode/label scan, quick-add, **Describe**/speech-to-text, AI photo, custom/recipe). Premium-only model means no ads and a privacy/product focus. Strength coach quoted as calling it *"the fastest tracking app he has ever used."* (https://www.welling.ai/articles/best-ai-coaching-macro-tracking-apps-2026, https://macrofactor.com/macrofactor-ai/)
- **Coaching / check-ins / nudges.** Weekly check-ins make believable, automatic target adjustments. Reviewer: found *"the coaching algorithm more interesting, involved, and believable hence trustworthy."* (https://apps.apple.com/ca/app/macrofactor-macro-tracker/id1553503471?see-all=reviews)
- **Loved at scale.** 4.8/5 (~5K App Store ratings), 200,000+ paying users, won Google Play "Best of 2024 – Best Everyday Essential" in US/CA/UK/AU. (https://www.businesswire.com/news/home/20241118746780/en/MacroFactor-Wins-Google-Play-Best-of-2024-Award)

### What users HATE
- **Price / no free tier (most common gripe).** $11.99/mo or $71.99/yr, 7-day trial only — "no free version, no permanently free features." Annual ($6/mo) seen as fair, but monthly is hard to justify vs cheaper rivals; not worth it for occasional trackers since the algorithm needs consistent daily data. (https://nutriscan.app/blog/posts/macrofactor-cost-2026-free-version-29f5edc98b, https://nutrola.app/en/blog/why-is-macrofactor-so-expensive)
- **Shallow/limited micronutrients vs Cronometer.** People wanting deep micronutrient data are routinely told to use Cronometer instead — the canonical reason to leave MF. (https://nutrola.app/en/blog/macrofactor-didnt-work-for-me-alternatives)
- **Smaller / regionally weak database & data-edit concerns.** Database smaller than MFP; outside English-speaking markets it returns "fewer verified matches and more user-contributed guesses," turning logging into research. OpenFoodFacts maintainers raised concerns about MacroFactor-originated edits — "seemingly random deletion of nutritional values… and insertion of ones that don't exist," often without backing photos. (https://forum.openfoodfacts.org/t/concerns-of-edits-from-macrofactor/568, https://www.nutrola.app/en/blog/why-is-macrofactor-so-inaccurate)
- **"Too complex / too narrow" for general weight-loss users.** Reviews note it's aimed at experienced lifters; manual-logging-centric and overkill for casual dieters. (https://www.trygaya.com/review/macrofactor-review)

### Repeatedly REQUESTED features (and what they shipped)
- **Recipe / URL import** was a long-standing top request — shipped July 2025 (import recipe details + macros from web links). (https://macrofactor.com/mm-july-2025/)
- Ongoing requests funneled through MacroFactor's **public roadmap with user voting** (a model users praise). Frequent asks include deeper micronutrient tracking, more AI/conversational logging, and meal templates. (https://macrofactor.com/mm-july-2025/, https://www.welling.ai/articles/best-ai-coaching-macro-tracking-apps-2026)

### Pricing sentiment — why people PAY anyway
Despite being subscription-only with no free tier, willingness to pay is high because the adaptive expenditure algorithm is seen as genuinely unique: *"MacroFactor's adaptive expenditure algorithm adjusts your calorie targets based on your actual results, not generic formulas. No competitor offers this at any price."* The premium-only model is framed positively by users: by charging everyone, MF avoids ads, protects privacy, and "focus[es] entirely on building a better product." Consensus: clearly worth it on the annual plan for committed daily trackers; overpriced for casual/occasional users. (https://nutrola.app/en/blog/why-is-macrofactor-so-expensive, https://nutriscan.app/blog/posts/macrofactor-cost-2026-free-version-29f5edc98b)

---

## Cross-app synthesis (the product gap)
- The two apps are near-complements: **Cronometer = micronutrient depth + curated accuracy, weak/clunky UX & exercise & pricing goodwill;** **MacroFactor = best-in-class adaptive TDEE + fast frictionless logging + no ads, weak micronutrients & no free tier.** Users wanting both are repeatedly told to run Cronometer for micros and MacroFactor for calorie/macro coaching.
- **Logging friction** is the inverse of each other: MacroFactor's logging UX is its most-loved trait; Cronometer's is its most-hated.
- **Monetization lesson:** MacroFactor proves users will gladly pay premium-only subscriptions when the core algorithm is differentiated and there are no ads; Cronometer shows the opposite risk — migrating once-free features behind a paywall and raising prices breeds resentment even among loyal users.

### 5–8 direct quotes (attributed)
1. *"MF is awesome. It's better at calorie tracking than any other app on the market, and its TDEE estimation algorithm is very accurate."* — Reddit year-in-review, via https://nutrola.app/en/blog/why-is-macrofactor-so-expensive
2. *"No competitor offers this at any price."* (on the adaptive expenditure algorithm) — https://nutrola.app/en/blog/why-is-macrofactor-so-expensive
3. *"the fastest tracking app he has ever used."* — strength coach App Store review, via https://www.welling.ai/articles/best-ai-coaching-macro-tracking-apps-2026
4. *"seemingly random deletion of nutritional values on products and insertion of ones that don't exist"* (MacroFactor edits) — https://forum.openfoodfacts.org/t/concerns-of-edits-from-macrofactor/568
5. *"cronometer experience is a mess"* — thread title, https://forums.cronometer.com/discussion/5176/cronometer-experience-is-a-mess
6. *"The Gold membership is very worth it if optional nutrition is your main concern as the Oracle recommendations help you fill gaps."* — App Store review, via https://forums.cronometer.com/discussion/comment/10772
7. They *"decided to require payment for things that were initially free to use."* (Cronometer paywall) — https://forums.cronometer.com/discussion/3712/paywall
8. *"the app you graduate to if you're serious about your nutrition"* (Cronometer) — https://www.cal33.com/blog/cronometer-vs-myfitnesspal

**Unreachable for direct fetch (403/blocked):** all reddit.com URLs, forums.cronometer.com, apps.apple.com, businesswire.com, macrofactor.com, trygaya.com, nutrola.app, nutriscan.app, promealplan.com. Quotes above are reported via search-engine snippets of those pages, not independently re-fetched HTML.