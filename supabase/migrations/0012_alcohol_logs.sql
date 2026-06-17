-- Alcohol logging. Separate from food_entries so we can keep a standard-
-- drinks tally and a hydration penalty, while still folding the calories
-- into the day's total. One row per drink logged.
create table if not exists alcohol_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drink_type text not null,
  volume_ml numeric not null check (volume_ml > 0 and volume_ml <= 3000),
  alcohol_g numeric not null check (alcohol_g >= 0),
  standard_drinks numeric not null check (standard_drinks >= 0),
  calories numeric not null check (calories >= 0),
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create index if not exists alcohol_logs_user_logged_idx
  on alcohol_logs (user_id, logged_at desc);

alter table alcohol_logs enable row level security;

do $$
begin
  execute 'drop policy if exists alcohol_logs_select on alcohol_logs';
  execute 'create policy alcohol_logs_select on alcohol_logs for select using (auth.uid() = user_id)';
  execute 'drop policy if exists alcohol_logs_insert on alcohol_logs';
  execute 'create policy alcohol_logs_insert on alcohol_logs for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists alcohol_logs_delete on alcohol_logs';
  execute 'create policy alcohol_logs_delete on alcohol_logs for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on alcohol_logs to authenticated, service_role;
