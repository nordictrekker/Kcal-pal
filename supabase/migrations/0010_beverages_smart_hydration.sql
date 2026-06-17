-- Beverages + smart hydration.
--
-- water_logs gains a drink `kind` (water/coffee/tea/…) and a
-- `hydration_factor` — the fraction of the volume that counts toward the
-- daily fluid goal (water = 1.0, coffee/tea ≈ 0.9, soda ≈ 0.8). Effective
-- fluid for a row is ml * hydration_factor. Existing rows are plain water.
alter table water_logs
  add column if not exists kind text not null default 'water',
  add column if not exists hydration_factor numeric not null default 1.0
    check (hydration_factor >= 0 and hydration_factor <= 1);

-- profiles: how the daily fluid goal is chosen. 'auto' derives it from body
-- weight (~31 ml/kg) plus an activity bump; 'manual' uses
-- daily_water_target_ml verbatim. Default to auto — the smart goal.
alter table profiles
  add column if not exists water_goal_mode text not null default 'auto'
    check (water_goal_mode in ('auto', 'manual'));
