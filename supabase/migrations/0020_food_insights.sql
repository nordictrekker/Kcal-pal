-- Food insights: an LLM-written, two-paragraph note about the last 7 days of
-- eating (standout foods + how to lift lagging macros/micros). User-triggered
-- from the 7-day-average view and cached per ISO year+week, mirroring
-- weekly_digests.

create table if not exists food_insights (
  user_id uuid not null references auth.users(id) on delete cascade,
  year_week text not null,  -- "2026-W24" (ISO 8601 week)
  summary text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, year_week)
);

alter table food_insights enable row level security;

do $$
begin
  execute 'drop policy if exists food_insights_select on food_insights';
  execute 'create policy food_insights_select on food_insights for select using (auth.uid() = user_id)';
  execute 'drop policy if exists food_insights_insert on food_insights';
  execute 'create policy food_insights_insert on food_insights for insert with check (auth.uid() = user_id)';
  execute 'drop policy if exists food_insights_update on food_insights';
  execute 'create policy food_insights_update on food_insights for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'drop policy if exists food_insights_delete on food_insights';
  execute 'create policy food_insights_delete on food_insights for delete using (auth.uid() = user_id)';
end $$;

grant select, insert, update, delete on food_insights to authenticated, service_role;
