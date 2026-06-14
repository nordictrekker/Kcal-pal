-- Cycle-phase nutrition modifiers (the v2 item the original spec deferred).
-- Per-phase multipliers applied to the daily macro targets in profiles.
-- Defaults are a reasonable starting point — user-adjustable on /settings.

alter table profiles
  add column if not exists phase_modifiers jsonb
  default '{
    "menstrual":  {"calories": 1.00, "protein": 1.00, "carbs": 0.95, "fat": 1.10, "fiber": 1.00},
    "follicular": {"calories": 1.00, "protein": 1.05, "carbs": 1.10, "fat": 0.90, "fiber": 1.00},
    "ovulatory":  {"calories": 1.00, "protein": 1.00, "carbs": 1.00, "fat": 1.00, "fiber": 1.00},
    "luteal":     {"calories": 1.05, "protein": 1.00, "carbs": 0.90, "fat": 1.15, "fiber": 1.10}
  }'::jsonb;

-- Backfill existing rows that were created before this column existed.
update profiles
set phase_modifiers = '{
  "menstrual":  {"calories": 1.00, "protein": 1.00, "carbs": 0.95, "fat": 1.10, "fiber": 1.00},
  "follicular": {"calories": 1.00, "protein": 1.05, "carbs": 1.10, "fat": 0.90, "fiber": 1.00},
  "ovulatory":  {"calories": 1.00, "protein": 1.00, "carbs": 1.00, "fat": 1.00, "fiber": 1.00},
  "luteal":     {"calories": 1.05, "protein": 1.00, "carbs": 0.90, "fat": 1.15, "fiber": 1.10}
}'::jsonb
where phase_modifiers is null;
