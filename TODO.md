# Kcal-pal TODO

Items deferred to Phase 10 (Polish) or marked for later. Kept in the repo so
they survive between Claude sessions and aren't forgotten.

## Phase 10 (Polish)

### Janitor: orphan storage cleanup
The photo flow uploads to `food-photos` storage BEFORE the confirm screen.
If the user cancels after analyze, the photo stays in storage forever.

Approach when we get there:
- Edge Function `cleanup-orphans` that queries `food-photos` storage for
  objects older than ~24h whose path is not referenced by any
  `food_entries.photo_url`.
- Schedule via pg_cron (daily, off-peak).
- Optional: also drop AI-parse `raw_ai_response` blobs older than N days
  to keep the DB lean — we only need them for debugging recent edits.

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
