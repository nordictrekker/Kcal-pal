-- Saved meals (quick-add). User explicitly saves a logged entry as a
-- reusable template; quick-add re-logs it in one tap. Idempotent.

create table if not exists saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  description text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  serving_size text,
  use_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists saved_meals_user_idx
  on saved_meals (user_id, last_used_at desc nulls last, use_count desc);

alter table saved_meals enable row level security;

do $$
begin
  -- Drop-then-create so re-running is safe.
  execute 'drop policy if exists saved_meals_select on saved_meals';
  execute 'create policy saved_meals_select on saved_meals for select using (auth.uid() = user_id)';
  execute 'drop policy if exists saved_meals_insert on saved_meals';
  execute 'create policy saved_meals_insert on saved_meals for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists saved_meals_update on saved_meals';
  execute 'create policy saved_meals_update on saved_meals for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists saved_meals_delete on saved_meals';
  execute 'create policy saved_meals_delete on saved_meals for delete using (auth.uid() = user_id)';
end $$;

-- The grants from 0001_init.sql already cover this table (they apply to
-- all tables in schema public for authenticated + service_role), but
-- re-running here is safe and makes this migration self-contained.
grant select, insert, update, delete on saved_meals to authenticated, service_role;
