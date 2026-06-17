-- Per-day logging completeness, so the adaptive-target engine never treats an
-- under-logged day as a real deficit (MacroFactor's "you can't out-log your
-- metabolism" problem). The next day we ask "did you log everything?" and
-- store the answer here; only days that are complete (or unanswered but not
-- statistical low-outliers) feed the rolling balance and adaptive TDEE.
create table if not exists day_log_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  status text not null check (status in ('complete', 'partial', 'skipped')),
  created_at timestamptz default now(),
  unique (user_id, day)
);
create index if not exists day_log_status_user_day_idx
  on day_log_status (user_id, day desc);

alter table day_log_status enable row level security;

do $$
begin
  execute 'drop policy if exists day_log_status_select on day_log_status';
  execute 'create policy day_log_status_select on day_log_status for select using (auth.uid() = user_id)';
  execute 'drop policy if exists day_log_status_insert on day_log_status';
  execute 'create policy day_log_status_insert on day_log_status for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists day_log_status_update on day_log_status';
  execute 'create policy day_log_status_update on day_log_status for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists day_log_status_delete on day_log_status';
  execute 'create policy day_log_status_delete on day_log_status for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on day_log_status to authenticated, service_role;
