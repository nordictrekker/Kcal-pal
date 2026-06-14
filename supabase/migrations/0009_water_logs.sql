-- Hydration tracking. Stored in milliliters (SI unit) so the schema is
-- unit-agnostic; the UI converts to ounces for display. One row per log
-- event so the daily total can be re-aggregated cheaply.

create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ml numeric not null check (ml > 0 and ml <= 5000),
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create index if not exists water_logs_user_logged_idx
  on water_logs (user_id, logged_at desc);

alter table water_logs enable row level security;

do $$
begin
  execute 'drop policy if exists water_logs_select on water_logs';
  execute 'create policy water_logs_select on water_logs for select using (auth.uid() = user_id)';
  execute 'drop policy if exists water_logs_insert on water_logs';
  execute 'create policy water_logs_insert on water_logs for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists water_logs_update on water_logs';
  execute 'create policy water_logs_update on water_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists water_logs_delete on water_logs';
  execute 'create policy water_logs_delete on water_logs for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on water_logs to authenticated, service_role;

-- Daily water target on profiles. Default ~80oz (10 cups), a common
-- baseline for an active adult; user-adjustable on /settings.
alter table profiles
  add column if not exists daily_water_target_ml int default 2400;

update profiles
set daily_water_target_ml = 2400
where daily_water_target_ml is null;
