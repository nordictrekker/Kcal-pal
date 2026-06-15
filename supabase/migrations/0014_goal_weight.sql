-- Goal weight powers the weight-projection line on the WeightCard.
-- Nullable so the onboarding wizard can collect it later; existing
-- users default to null until they set one.
-- Idempotent.

alter table profiles
  add column if not exists goal_weight_lbs numeric;
