# Kcal-pal TODO

Items deferred to Phase 10 (Polish) or marked for later. Kept in the repo so
they survive between Claude sessions and aren't forgotten.

## Done

### Janitor: orphan storage cleanup ✓ (Phase 10)
Edge Function `cleanup-orphans` deletes `food-photos` objects older than
24h not referenced by any `food_entries.photo_url`. Scheduled daily at
4 UTC via `0005_cleanup_cron.sql`.

## Still open / future

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
