-- Trans fat: the dietary driver of blood LDL not yet tracked. Surfaced (with
-- saturated fat + dietary cholesterol) as the "LDL impact" home-screen metrics.
alter table food_entries
  add column if not exists trans_fat_g numeric;
