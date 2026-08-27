-- Cached nutrition for a user's declared supplements: researched ONCE (label
-- web-search at add time) and reused on every one-tap log — no re-analysis.
create table if not exists public.supplement_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  name_key text not null,
  nutrients jsonb not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, name_key)
);

alter table public.supplement_profiles enable row level security;

create policy "supplement_profiles own"
  on public.supplement_profiles for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Table privileges must exist before RLS applies (lesson from bug_reports).
grant select, insert, update, delete on table public.supplement_profiles to authenticated;
