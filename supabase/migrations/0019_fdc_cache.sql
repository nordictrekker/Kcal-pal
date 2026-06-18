-- USDA FoodData Central lookup cache.
--
-- Micronutrients (iron, calcium, magnesium, vitamin D, omega-3, saturated fat,
-- cholesterol) are enriched by looking up the AI-identified food items in USDA
-- FoodData Central and scaling real per-100 g values by the item's weight. This
-- table caches those per-100 g profiles (and misses) keyed by the normalized
-- food name so repeated foods are instant and we stay well under FDC rate
-- limits. It's shared reference data — not user-scoped.

create table if not exists fdc_cache (
  query text primary key,             -- normalized (trimmed, lowercased) food name
  fdc_id integer,                     -- matched FDC food id (null on a miss)
  description text,                   -- matched FDC description (for debugging)
  per100g jsonb,                      -- { saturated_fat_g, cholesterol_mg, iron_mg, ... } per 100 g
  matched boolean not null default false,
  fetched_at timestamptz not null default now()
);

alter table fdc_cache enable row level security;

grant select, insert, update on fdc_cache to authenticated;

-- Shared reference data: any signed-in user may read and populate the cache.
create policy fdc_cache_select on fdc_cache for select using (auth.role() = 'authenticated');
create policy fdc_cache_insert on fdc_cache for insert with check (auth.role() = 'authenticated');
create policy fdc_cache_update on fdc_cache for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
