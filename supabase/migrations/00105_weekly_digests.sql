-- Weekly digest: an LLM-written narrative summary of the week's data.
-- Keyed by ISO year+week so each calendar week has at most one digest.
-- Generated on demand (lazy) when the /weekly page is loaded and the
-- current week's row is missing or stale.

create table if not exists weekly_digests (
  user_id uuid not null references auth.users(id) on delete cascade,
  year_week text not null,  -- "2026-W24" (ISO 8601 week)
  summary text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, year_week)
);

alter table weekly_digests enable row level security;

do $$
begin
  execute 'drop policy if exists weekly_digests_select on weekly_digests';
  execute 'create policy weekly_digests_select on weekly_digests for select using (auth.uid() = user_id)';
  execute 'drop policy if exists weekly_digests_insert on weekly_digests';
  execute 'create policy weekly_digests_insert on weekly_digests for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists weekly_digests_update on weekly_digests';
  execute 'create policy weekly_digests_update on weekly_digests for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists weekly_digests_delete on weekly_digests';
  execute 'create policy weekly_digests_delete on weekly_digests for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on weekly_digests to authenticated, service_role;
