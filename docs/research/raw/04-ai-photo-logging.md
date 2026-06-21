I have thorough, well-attributed material across 14 searches. WebFetch was uniformly blocked (403) across all attempted URLs, but WebSearch returned detailed, quote-level summaries from the target sources. Here are my findings.

---

# AI Photo Calorie-Logging Apps: What Users LOVE, HATE, and REQUEST

**Apps covered:** Cal AI, SnapCalorie, Calorie AI and similar AI-photo newcomers, plus MyFitnessPal's AI features (MFP acquired Cal AI in March 2026).

**Method note:** 14 web searches run. WebFetch was blocked with HTTP 403 on every primary URL attempted (Hacker News, HN Algolia API, Trustpilot, TechCrunch, JustUseApp, WellnessPulse, foodbuddy, rex.fit, welling.ai, nutrifytracker). Bash/curl was also blocked (host not in allowlist). All findings below therefore come from WebSearch result summaries, which surfaced quote-level detail and specific figures from those same sources. Direct verbatim Reddit/HN comment threads could not be opened to copy quotes word-for-word; quotes below are as surfaced by search summaries and should be treated as near-verbatim/paraphrase where noted.

---

## 1. What users LOVE (and why)

- **Speed and low friction of photo logging** is the dominant draw. Cal AI "was built for speed and simplicity rather than lab-grade accuracy — and users loved it." Reviewers frame it as "good enough" automation being preferable to manual entry: even when an estimate is slightly off, "the 'good enough' accuracy of an automated system is preferable to the tediousness of a manual one" (https://nutrifytracker.com/blog/cal-ai-vs-mfp).
- **Time savings quantified:** AI logging cited as roughly a "90% reduction in logging time," which for weight-loss users "often makes consistency more important than precision" (https://news.ycombinator.com/item?id=44220135 summary; https://www.jotform.com/ai/best-ai-calorie-tracker/).
- **Clean, simple UI / ease of logging.** r/nutrition user: "Cal AI is the easiest one I used. The app looks clean and it's very simple to log food" (surfaced via https://nutriscan.app/blog/posts/cal-ai-premium-worth-it-2026-photo-scan-vs-price-4b60706465).
- **Multi-modal input** (photo + voice + barcode + text description) is praised as making logging "effortless" — SnapCalorie supports "voice, picture, or label input"; ParrotPal/Carb Manager/MyFitnessPal/Nutrola all market voice logging as a loved hands-free feature (https://nutrola.app, https://www.jotform.com/ai/best-ai-calorie-tracker/).
- **Works well on simple, single, visible foods.** For "a bowl of fruit or a grilled chicken breast, estimates are often within 10% of actual values" (https://nutriscan.app/...). Food *identification* is correct in ~68–86% of real-world cases (https://fitia.app/learn/article/ai-calorie-photo-apps-accuracy-2026/).
- **Helpful for beginners** building awareness: "even approximate calculations can help people better understand their energy consumption habits" (https://wellnesspulse.com/nutrition/snapcalorie-ai-image-tracker-review/).
- **Real outcomes:** A SnapCalorie Redditor reported losing 20 lbs using the app (https://foodbuddy.my/blog/the-best-ai-calorie-counter-apps-according-to-reddit).
- **Novelty / social proof:** Strong store ratings — Cal AI ~4.8 stars on ~66k App Store reviews and 4.8 on ~75k Google Play reviews; >1M downloads (https://nutriscan.app/...; https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/).

---

## 2. What users HATE — AI photo INACCURACY (the #1 complaint)

**Headline accuracy quantification:**
- AI calorie counters are roughly **82% accurate vs. ~94% for manual entry** (https://news.ycombinator.com/item?id=44220135 summary; https://www.jotform.com/ai/best-ai-calorie-tracker/).
- Within **10–15% of actual on single recognizable foods; 25–35% off on complex/mixed meals** (https://fitia.app/...).
- **Portion-size estimation is the weak link — accuracy as low as 39%** even when food ID is correct (https://fitia.app/...).
- A **2024 PLOS Digital Health study (18 dietitians)** found computer-vision food apps "work poorly on the food photos that real people take in their daily lives," concluding AI + human review + context works best (surfaced across multiple accuracy articles, e.g. https://whatthefood.io/blog/how-accurate-are-ai-calorie-counters).
- Supervised dietetics-student tests: AI apps **overestimated Western diets by ~1,040 kJ, underestimated Asian diets by ~1,520 kJ, underreported balanced diets by ~944 kJ** (i.e., bias direction is inconsistent and cuisine-dependent).
- **SnapCalorie:** ~±19.8% MAPE (described as "the weakest accuracy of AI photo trackers tested" in one comparison), though the company's own published figure is a ~16% mean error rate; "weak performance with non-Western cuisines" (https://nutrola.app/en/blog/nutrola-vs-cal-ai-vs-snapcalorie-photo-calorie-tracker-2026; https://www.trustpilot.com/review/snapcalorie.com).

**Specific misidentification complaints (the stuff users screenshot and mock):**
- Cal AI: an **apple misidentified as tikka masala** (https://nutrifytracker.com/blog/cal-ai-vs-mfp).
- Cal AI: **pretzel sticks analyzed as French fries** (https://justuseapp.com/en/app/6480417616/cal-ai-calorie-tracking/reviews).
- SnapCalorie: showed **"meat in sauce" instead of ratatouille**, and **"a glass of coffee with milk" instead of rosé wine**, "with quantities often being totally unrealistic" (https://wellnesspulse.com/nutrition/snapcalorie-ai-image-tracker-review/; https://www.trustpilot.com/review/snapcalorie.com).
- Cal AI salad example: a mixed salad "estimated at 450 calories that may actually be 200 or 700 depending on dressing and toppings" (https://nutrifytracker.com/blog/cal-ai-vs-mfp).

**Hidden ingredients / oils — structural blind spot users call out:**
- "Cooking oils, butter, sauces, dressings, and ingredients underneath other foods are invisible to the AI." A "salad dressed in olive oil [can be] off by 200+ calories" (https://nutriscan.app/...; https://fitia.app/...).
- Founder Zach Yadegari himself admits "foods with many ingredients or layered ingredients, like a salad, will cause the image scanner to show less accurate results"; the company claims 90% accuracy "but customer reviews show numerous complaints about the app's accuracy" (https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/).

**Portion guessing from a single 2D photo:** "The AI guesses portion size from a single photo with no depth reference" — repeatedly cited as the core reliability gap (https://nutriscan.app/...).

**Corrections don't stick (rework burden — see Friction below):** The "fix this" feature "seems to never adjust macros or calories" — correcting pretzel-sticks-vs-fries "changed the title but did not adjust the calories or macros" (https://justuseapp.com/...). Corrections also "do not persist" across logs (https://nutrifytracker.com/blog/cal-ai-vs-mfp).

**Pricing / billing practices users distrust (see §5).**

**Influencer-marketing distrust / hype fatigue:** Cal AI's growth was "driven through influencer marketing and viral creator content on TikTok and X." Broader context: ~26% of US consumers distrust influencer marketing (vs 11% for ads generally); 64% distrust influencers who don't disclose brand relationships (https://www.founded.com/this-teenager-built-a-30m-a-year-calorie-app...; https://www.emarketer.com/content/tiktok-loses-gen-z-confidence...). TechCrunch also "couldn't validate [the founder's] download and revenue claims" (https://techcrunch.com/2025/03/16/...).

**Privacy / trust blow:** Alleged **March 2026 data breach exposing ~3M users** (~14.59 GB) via an unauthenticated Google Firebase database — emails, weights, DOB, subscription details, "even the times of day they eat." Company has not publicly confirmed (https://www.kiteworks.com/cybersecurity-risk-management/cal-ai-data-breach-3-million-users-health-data-exposed/; https://hackread.com/cal-ai-myfitnesspal-data-breach-3m-users/; https://cybernews.com/security/calai-app-users-exposed-after-alleged-breach/).

---

## 3. Feature REQUESTS (granular)

- **Make "fix this"/corrections actually update calories and macros** — not just the food's title (https://justuseapp.com/...).
- **Persistent corrections / let the AI learn** — "unable to correct the AI's mistakes or teach it to improve" is a recurring complaint; users want corrections to carry forward (https://nutrifytracker.com/blog/cal-ai-vs-mfp).
- **Edit saved foods** — add a delete option and **duplicate detection** for repeated entries (https://justuseapp.com/...).
- **Edit ingredients by weight rather than fractions** ("based on weight versus fractions in some instances") (https://justuseapp.com/...).
- **Context/note field to declare hidden ingredients** — an "Add Note" feature so users can specify oils, sauces, or menu descriptions; some apps already ship this and it's requested where absent (https://welling.ai/articles/best-calorie-counter-apps-eating-out-2026; https://fitia.app/...).
- **Voice logging** as first-class (not just speech-to-text into a search bar) — "very few calorie trackers support true voice-based food logging" (https://nutrola.app/en/blog/is-there-a-calorie-tracker-that-logs-food-by-voice).
- **Depth/LiDAR-based portion measurement** — SnapCalorie's iPhone-Pro LiDAR volume scan is held up as the gold standard others should match (±80 cal on Pro vs ±130 on non-Pro) (https://techcrunch.com/2023/06/26/snapcalorie-computer-vision-health-app-raises-3m/).
- **Better non-Western / mixed-dish / home-cooked coverage** — datasets are "Western, single-item" biased (https://fitia.app/...).
- **Transparent, upfront pricing** before the onboarding quiz/paywall (§5).

---

## 4. Friction: does AI reduce friction or create rework?

The central tension. AI removes *entry* friction (snap vs. search-and-weigh — "~90% reduction in logging time") but introduces a **correction/rework burden** when estimates are wrong:

- When the photo is misidentified, users must manually intervene — but corrections frequently **fail to update the numbers** ("fix this" changes title only) and **don't persist**, so the same dish must be re-corrected each time (https://justuseapp.com/...; https://nutrifytracker.com/blog/cal-ai-vs-mfp).
- Hidden oils/sauces require the user to *know* the app is wrong and add notes manually — defeating the "effortless" promise, especially for restaurant meals with "hidden fats in cooking" and no standardized data (https://welling.ai/...).
- Net verdict from reviewers: "neither [Cal AI nor MFP] is a passive, fire-and-forget solution… practical accuracy depends heavily on how carefully you use them" (https://nutrifytracker.com/blog/cal-ai-vs-mfp).
- Failure-mode risk flagged on HN: inaccurate estimates "too low or too high" can cause "frustration or diet fatigue" and undermine the weight-loss goal (https://news.ycombinator.com/item?id=44220135).
- The pro-AI counterargument (also on HN): for consistency-driven weight loss, "good enough" + logged-every-day beats precise-but-abandoned (https://news.ycombinator.com/item?id=44220135).

---

## 5. Pricing sentiment

Strongly negative on *practices*, even where users like the product:

- **Hidden pricing:** cost isn't shown on the website or store page — only revealed "after you download the app, complete a multi-step onboarding quiz, and reach the paywall," a deliberate tactic "that gets users invested before showing the price" (https://www.eesel.ai/blog/cal-ai-pricing; https://nutriscan.app/blog/posts/cal-ai-pricing-2026-monthly-yearly-premium-abc6e7b26f).
- **Dynamic pricing:** "If you ask ten different Cal AI users what they pay, you might get ten different answers" — price varies by "location, device, or how you answered the setup questions." Reported range **$2.99/week to $29.99–$49.99/year** (sources differ on the cap) (https://www.eesel.ai/blog/cal-ai-pricing; https://nutrifytracker.com/blog/is-cal-ai-worth-it).
- **Trial-to-charge traps & refund pain:** 3-day free trial auto-charges; users report "fake discount pages," being charged after attempting to cancel, automated/looping support replies, and being pushed to Apple "report-a-problem" tickets or credit-card chargebacks (https://nutriscan.app/blog/posts/cal-ai-free-trial-cancel-before-charged-0761ab8d00).
- These are characterized as trust-damaging "dark pattern" practices "not outright scam accusations" but enough to sour sentiment (https://www.eesel.ai/blog/cal-ai-pricing).

---

## 6. Direct quotes (with source attribution)

As noted, these are quotes as surfaced by search summaries; the live comment pages returned 403.

1. "Cal AI is the easiest one I used. The app looks clean and it's very simple to log food. But the problem is accuracy: it often doesn't understand portion size." — r/nutrition user, via https://nutriscan.app/blog/posts/cal-ai-premium-worth-it-2026-photo-scan-vs-price-4b60706465

2. On SnapCalorie: showed "meat in sauce" instead of ratatouille, and "a glass of coffee with milk instead of rosé wine," with quantities "often totally unrealistic." — https://wellnesspulse.com/nutrition/snapcalorie-ai-image-tracker-review/ / https://www.trustpilot.com/review/snapcalorie.com

3. Cal AI "fix this" correction: user said the food was pretzel sticks (not French fries); the app "changed the title… but did not adjust the calories or macros." — https://justuseapp.com/en/app/6480417616/cal-ai-calorie-tracking/reviews

4. "If you ask ten different Cal AI users what they pay, you might get ten different answers." — https://www.eesel.ai/blog/cal-ai-pricing

5. Founder Zach Yadegari conceding the limitation: foods "with many ingredients or that might have ingredients layered throughout, like a salad, will cause the image scanner to show less accurate results." — https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/

6. "Even if Cal AI's initial estimate is slightly inaccurate… the 'good enough' accuracy of an automated system is preferable to the tediousness of a manual one." — https://nutrifytracker.com/blog/cal-ai-vs-mfp

7. 2024 PLOS Digital Health: computer-vision food apps "work poorly on the food photos that real people take in their daily lives." — via https://whatthefood.io/blog/how-accurate-are-ai-calorie-counters

8. SnapCalorie company claim: "+/- 80 calories on an iPhone Pro and +/- 130 on a regular iPhone, compared to users eyeballing portion size visually at +/- 265 calories on average." — https://techcrunch.com/2023/06/26/snapcalorie-computer-vision-health-app-raises-3m/

---

## Key takeaways for a product builder

1. **Speed is the moat, inaccuracy is the churn risk.** Users adopt for friction reduction; they leave (or distrust) over portion/hidden-ingredient errors. The two are in tension — winning means reducing *rework*, not just *entry effort*.
2. **The #1 fixable complaint is that corrections don't update numbers or persist.** A correction loop that actually adjusts calories/macros and learns per-user would directly address the loudest, most concrete pain point.
3. **Hidden oils/sauces and 2D portion guessing are the structural accuracy ceiling.** Depth/LiDAR (SnapCalorie's edge) + a lightweight "add hidden ingredient/note" prompt are the proven mitigations.
4. **Pricing transparency is a trust differentiator.** Hidden/dynamic pricing, quiz-gated paywalls, and refund friction generate disproportionate negative sentiment — an upfront, single price could be a marketing wedge.
5. **Privacy is now table stakes** post the alleged 3M-user Cal AI Firebase breach.
6. **Influencer hype cuts both ways** — drove Cal AI's growth but fuels a distrustful, skeptical cohort (esp. on HN/Reddit) who want evidence (peer-reviewed accuracy, like SnapCalorie's Nutrition5k paper) over TikTok virality.

**Sources that returned the richest material:** TechCrunch (Cal AI + SnapCalorie), nutrifytracker.com, eesel.ai, nutriscan.app, fitia.app, welling.ai, wellnesspulse.com, justuseapp.com, kiteworks/hackread/cybernews (breach), and HN thread #44220135. **Unreachable via fetch (403):** all of the above when accessed directly, plus Trustpilot, foodbuddy.my, rex.fit, and both HN comment pages / the HN Algolia API.