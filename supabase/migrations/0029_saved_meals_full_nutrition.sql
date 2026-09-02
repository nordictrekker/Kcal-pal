-- Saved meals only ever stored five macros, so re-logging a saved meal lost
-- every micronutrient (and the component breakdown that carries portion
-- detail). Widen the template to the same nutrient surface as food_entries so
-- a quick-add is a faithful copy of the entry it was saved from.
--
-- Grants: 0001_init.sql grants on all tables in schema public for
-- authenticated + service_role, and 0007 re-granted saved_meals explicitly.
-- Adding columns needs no new grant (grants are table-level), but RLS policies
-- alone are never enough — see 0024/0028 for the bug that taught us that.

alter table saved_meals
  add column if not exists saturated_fat_g numeric,
  add column if not exists trans_fat_g numeric,
  add column if not exists cholesterol_mg numeric,
  add column if not exists iron_mg numeric,
  add column if not exists calcium_mg numeric,
  add column if not exists magnesium_mg numeric,
  add column if not exists vitamin_d_mcg numeric,
  add column if not exists omega3_mg numeric,
  add column if not exists folate_mcg numeric,
  add column if not exists choline_mg numeric,
  add column if not exists iodine_mcg numeric,
  add column if not exists plants text[],
  add column if not exists raw_ai_response jsonb,
  add column if not exists updated_at timestamptz;

-- Backfill templates saved before this migration from the most recent food
-- entry with the same description. Only fills rows that carry no micros yet,
-- and only where the macros still match (within rounding) so we never staple
-- another food's micronutrients onto a template.
-- The lateral join lives inside a CTE: an UPDATE ... FROM LATERAL cannot
-- reference the update target (Postgres 42P10).
with best as (
  select sm.id as saved_meal_id, sm.calories as saved_calories,
         sm.serving_size as saved_serving_size, f.*
  from saved_meals sm
  join lateral (
    select f.*
    from food_entries f
    where f.user_id = sm.user_id
      and f.description = sm.description
    order by f.edited_by_user desc, f.consumed_at desc
    limit 1
  ) f on true
  where sm.iron_mg is null
    and sm.calcium_mg is null
    and sm.cholesterol_mg is null
)
update saved_meals sm
set saturated_fat_g = fe.saturated_fat_g,
    trans_fat_g     = fe.trans_fat_g,
    cholesterol_mg  = fe.cholesterol_mg,
    iron_mg         = fe.iron_mg,
    calcium_mg      = fe.calcium_mg,
    magnesium_mg    = fe.magnesium_mg,
    vitamin_d_mcg   = fe.vitamin_d_mcg,
    omega3_mg       = fe.omega3_mg,
    folate_mcg      = fe.folate_mcg,
    choline_mg      = fe.choline_mg,
    iodine_mcg      = fe.iodine_mcg,
    plants          = fe.plants,
    raw_ai_response = fe.raw_ai_response,
    serving_size    = coalesce(fe.saved_serving_size, fe.serving_size),
    updated_at      = now()
from best fe
where fe.saved_meal_id = sm.id
  and (fe.saved_calories is null or fe.calories is null
       or abs(fe.saved_calories - fe.calories) <= 1);
