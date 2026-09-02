-- The E2E smoke test submits a real bug report on every CI run, once per
-- browser project, and nothing ever removed those rows: 492 of the 493 rows in
-- bug_reports were test submissions, burying the single genuine user report.
--
-- Three parts: let a user delete their own report (so the E2E teardown can
-- clean up after itself, and so "withdraw this report" is possible at all),
-- purge the accumulated test rows, and add the covering index the advisor
-- flagged on the user_id foreign key.

-- 1. Own-row delete. Same shape as the existing select/insert policies, and the
--    table grant is required alongside the policy — RLS restricts which rows,
--    but the role needs the privilege first (see the note in 0024).
drop policy if exists "bug_reports delete own" on public.bug_reports;
create policy "bug_reports delete own"
  on public.bug_reports for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant delete on table public.bug_reports to authenticated;

-- 2. Purge the accumulated E2E submissions. Matches the exact prefix the smoke
--    test writes, so a genuine report that merely mentions "E2E" is untouched.
delete from public.bug_reports where message like 'E2E smoke:%';

-- 3. Covering index for the user_id FK (Supabase advisor
--    0001_unindexed_foreign_keys). Reads are always own-rows-only, so this is
--    the access path every query takes.
create index if not exists bug_reports_user_idx
  on public.bug_reports (user_id, created_at desc);
