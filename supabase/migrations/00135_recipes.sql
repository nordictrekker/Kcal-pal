-- Recipe library: save a parsed recipe, then quick-log a serving as a
-- food entry in one tap. Sourced either by URL (Anthropic parses) or by
-- promoting a logged entry. Idempotent.

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_url text,
  servings numeric default 1,                -- total servings the recipe makes
  -- Per-serving macros (nullable so a partial parse still saves).
  calories_per_serving numeric,
  protein_g_per_serving numeric,
  carbs_g_per_serving numeric,
  fat_g_per_serving numeric,
  fiber_g_per_serving numeric,
  serving_size text,                          -- e.g. "1 cup", "1 slice"
  ingredients jsonb,                          -- raw parsed structure
  notes text,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists recipes_user_idx
  on recipes (user_id, last_used_at desc nulls last, use_count desc);

alter table recipes enable row level security;

do $$
begin
  execute 'drop policy if exists recipes_select on recipes';
  execute 'create policy recipes_select on recipes for select using (auth.uid() = user_id)';
  execute 'drop policy if exists recipes_insert on recipes';
  execute 'create policy recipes_insert on recipes for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists recipes_update on recipes';
  execute 'create policy recipes_update on recipes for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists recipes_delete on recipes';
  execute 'create policy recipes_delete on recipes for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on recipes to authenticated, service_role;
