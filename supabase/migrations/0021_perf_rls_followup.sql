-- Performance follow-up (Supabase advisor: auth_rls_initplan).
--
-- The fdc_cache (0019) and food_insights (0020) tables were created after the
-- 0017 perf pass ran, so their RLS policies still call auth.uid() directly and
-- re-evaluate it per row. Re-run the same mechanical rewrite, which only touches
-- policies that still use the bare auth.uid() shape (idempotent).
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

-- fdc_cache uses auth.role() (shared reference data, not user-scoped), which the
-- loop above doesn't touch. Wrap it in a scalar subselect for the same reason.
alter policy fdc_cache_select on public.fdc_cache
  using ((select auth.role()) = 'authenticated');
alter policy fdc_cache_insert on public.fdc_cache
  with check ((select auth.role()) = 'authenticated');
alter policy fdc_cache_update on public.fdc_cache
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

