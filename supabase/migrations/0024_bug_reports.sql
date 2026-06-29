-- In-app bug / feedback reports. Users submit from Settings; reads are own-only
-- via RLS (an operator reviews all reports out-of-band via the service role).
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  context text,
  user_agent text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

create policy "bug_reports insert own"
  on public.bug_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "bug_reports select own"
  on public.bug_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists bug_reports_created_idx
  on public.bug_reports (created_at desc);

-- The authenticated role needs table privileges before RLS can apply (RLS then
-- restricts which rows). Without this, inserts fail with "permission denied".
grant select, insert on table public.bug_reports to authenticated;
