-- Expand oura_daily to capture the full daily picture Oura exposes.
-- The `raw` jsonb already holds everything; these columns surface the
-- high-value fields for querying, trends, and (critically) total_calories
-- which drives the dynamic/adaptive calorie targets.
-- Idempotent: every column guarded with `if not exists`.

alter table oura_daily
  add column if not exists active_calories int,
  add column if not exists total_calories int,        -- measured TDEE for the day
  add column if not exists target_calories int,
  add column if not exists average_met numeric,
  add column if not exists sleep_efficiency int,
  add column if not exists sleep_latency_min int,
  add column if not exists light_sleep_min int,
  add column if not exists restless_periods int,
  add column if not exists average_breath numeric,
  add column if not exists average_hr_sleep numeric,
  add column if not exists temp_trend_deviation numeric,
  add column if not exists spo2_avg numeric,
  add column if not exists stress_high_min int,
  add column if not exists recovery_high_min int,
  add column if not exists resilience_level text;
