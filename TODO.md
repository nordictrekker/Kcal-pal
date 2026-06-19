# Kcal-pal TODO

Items deferred to Phase 10 (Polish) or marked for later. Kept in the repo so
they survive between Claude sessions and aren't forgotten.

## Done

### Janitor: orphan storage cleanup ✓ (Phase 10)
Edge Function `cleanup-orphans` deletes `food-photos` objects older than
24h not referenced by any `food_entries.photo_url`. Scheduled daily at
4 UTC via `0005_cleanup_cron.sql`.

## Still open / future

### Supplements tracker (planned feature)
Many users take several supplements daily (vitamin D, magnesium, iron, fish
oil, B12, creatine, etc.) and want them tracked. Goal: log supplements and
fold their nutrient contributions into the same macro/micro totals and the
7-day average so "lagging micros" reflect what's actually being taken.

Rough shape:
- New `supplements` table: user_id, name, brand (optional), serving label,
  and per-serving nutrient amounts (reuse the nutrient columns —
  iron_mg, calcium_mg, magnesium_mg, vitamin_d_mcg, omega3_mg, plus room for
  others like b12_mcg, zinc_mg, vitamin_c_mg). RLS per user, like other tables.
- New `supplement_logs` table: user_id, supplement_id, taken_at, servings —
  one row per intake, so totals roll up per day like food_entries.
- Optional: a "regimen" with reminder schedule (daily AM/PM) and a quick
  one-tap "took my supplements" action on Today.
- Onboarding/AI assist: let the user type "Nature Made Vitamin D3 2000 IU" and
  have the parser fill the per-serving nutrients (same Anthropic pipeline as
  food), with a manual-edit fallback.
- Surfacing: add a "Supplements" line to Today and include their micros in the
  summary + 7-day average totals (clearly attributed, e.g. a "from supplements"
  sub-slice in the contributor breakdown so food vs supplement is distinguishable).
- Consider an upper-limit guard (e.g. iron/vitamin D) so the app can gently
  flag megadosing against tolerable upper intake levels.

- Optional: drop AI-parse `raw_ai_response` blobs older than N days to keep
  the DB lean — only needed for debugging recent edits.

### Other cost-optimization ideas to evaluate

- **Sonnet 4.6 for text+barcode parsing** instead of Opus 4.8 — ~40%
  cheaper per call, same nutrition database knowledge. Tiny absolute
  savings (~$0.0004/entry) but adds up if logging is daily.
- **Trim system prompts.** Current prompts are explicit about the JSON
  schema. With strict `output_config.format` we could rely on the
  schema enforcer instead of describing it in prose.
- **Photo retention.** After say 90 days, drop the underlying photo from
  storage but keep the parsed entry. The user has already confirmed the
  macros; the image is only useful for re-checks.
- **Vercel function region.** Default is iad1 (us-east). If the user is on
  the west coast, switching to sfo1 trims ~70ms RTT. Not money but UX.
