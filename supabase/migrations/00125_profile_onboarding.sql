-- Profile fields for onboarding, smarter targets, and automated cycle
-- tracking. All nullable / defaulted so existing rows keep working; the
-- onboarding wizard fills them in. `goal` and `height_in` already exist
-- from 0001.
-- Idempotent.

alter table profiles
  -- Identity / personalization
  add column if not exists first_name text,
  add column if not exists date_of_birth date,
  add column if not exists sex text default 'female',
  add column if not exists onboarding_completed boolean default false,

  -- Smarter targets
  add column if not exists activity_level text default 'moderate',
  add column if not exists target_mode text default 'manual',   -- 'manual' | 'auto'
  add column if not exists protein_per_kg numeric default 1.8,

  -- Cycle automation
  add column if not exists track_cycle boolean default true,
  add column if not exists last_period_start date,
  add column if not exists avg_cycle_length int default 28,
  add column if not exists avg_period_length int default 5;

-- Backfill sensible defaults for any pre-existing row.
update profiles set sex = 'female' where sex is null;
update profiles set activity_level = 'moderate' where activity_level is null;
update profiles set target_mode = 'manual' where target_mode is null;
update profiles set protein_per_kg = 1.8 where protein_per_kg is null;
update profiles set track_cycle = true where track_cycle is null;
update profiles set avg_cycle_length = 28 where avg_cycle_length is null;
update profiles set avg_period_length = 5 where avg_period_length is null;
update profiles set onboarding_completed = false where onboarding_completed is null;
