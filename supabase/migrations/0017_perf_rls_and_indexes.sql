-- Performance pass (from Supabase advisors).
--
-- 1. auth_rls_initplan: wrap auth.uid() in a scalar subselect so Postgres
--    evaluates it once per query instead of once per row. All policies use the
--    simple `auth.uid() = user_id` shape, so this is a mechanical rewrite.
do $$
declare
  r record;
  nq text;
  nc text;
  stmt text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    nq := null;
    nc := null;
    if r.qual is not null
       and r.qual ilike '%auth.uid()%'
       and r.qual not ilike '%select auth.uid()%' then
      nq := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    end if;
    if r.with_check is not null
       and r.with_check ilike '%auth.uid()%'
       and r.with_check not ilike '%select auth.uid()%' then
      nc := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    end if;
    if nq is null and nc is null then
      continue;
    end if;
    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if nq is not null then stmt := stmt || format(' using (%s)', nq); end if;
    if nc is not null then stmt := stmt || format(' with check (%s)', nc); end if;
    execute stmt;
  end loop;
end $$;

-- 2. Drop duplicate (and reported-unused) indexes; the partner index covers
--    the same (user_id, time) access pattern.
drop index if exists food_entries_user_id_consumed_at_idx;
drop index if exists body_weights_user_id_measured_at_idx;
drop index if exists apple_health_data_user_id_metric_recorded_at_idx;

-- 3. Cover the remaining unindexed foreign keys.
create index if not exists apple_health_imports_user_id_idx
  on apple_health_imports (user_id);
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);
