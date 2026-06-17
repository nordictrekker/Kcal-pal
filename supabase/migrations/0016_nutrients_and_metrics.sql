-- Richer nutrition: break out saturated fat + cholesterol, add cycle-relevant
-- micronutrients (iron/calcium/magnesium/vitamin D/omega-3), and a per-entry
-- list of distinct plant foods for a "plant diversity" goal. All AI-estimated
-- (directional, not lab-grade) and surfaced on the food-log detail page.
alter table food_entries
  add column if not exists saturated_fat_g numeric,
  add column if not exists cholesterol_mg numeric,
  add column if not exists iron_mg numeric,
  add column if not exists calcium_mg numeric,
  add column if not exists magnesium_mg numeric,
  add column if not exists vitamin_d_mcg numeric,
  add column if not exists omega3_mg numeric,
  add column if not exists plants text[] not null default '{}';

-- Which metrics the user wants on the home calorie card (null → sensible
-- default). Everything is always visible on the food-log detail page.
alter table profiles
  add column if not exists visible_metrics jsonb;
