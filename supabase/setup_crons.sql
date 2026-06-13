-- ============================================================================
-- Kcal-pal — one-paste cron + Vault setup for the remaining edge functions.
--
-- Covers: sync-eight-sleep, send-quarterly-push, cleanup-orphans.
-- (sync-oura is already set up.)
--
-- BEFORE RUNNING:
--   1. Deploy the three edge functions (Dashboard → Edge Functions), each
--      with Verify JWT OFF and the secrets listed in SETUP.md.
--   2. Find-replace the token  __PASTE_SB_SECRET_KEY__  below with your
--      sb_secret_… key (Project Settings → API → Secret keys → Reveal).
--      It appears once. Do NOT commit this file after pasting the key.
--
-- Safe to re-run. Project ref is pre-filled.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Idempotent vault upsert helper.
do $$
declare
  k text;
  v text;
  pairs text[][] := array[
    ['sync_eight_sleep_url',  'https://nrfvsfmhzrkrokzzupen.supabase.co/functions/v1/sync-eight-sleep'],
    ['sync_eight_sleep_auth', '__PASTE_SB_SECRET_KEY__'],
    ['quarterly_push_url',    'https://nrfvsfmhzrkrokzzupen.supabase.co/functions/v1/send-quarterly-push'],
    ['quarterly_push_auth',   '__PASTE_SB_SECRET_KEY__'],
    ['cleanup_orphans_url',   'https://nrfvsfmhzrkrokzzupen.supabase.co/functions/v1/cleanup-orphans'],
    ['cleanup_orphans_auth',  '__PASTE_SB_SECRET_KEY__']
  ];
  i int;
  sid uuid;
begin
  for i in 1 .. array_length(pairs, 1) loop
    k := pairs[i][1];
    v := pairs[i][2];
    select id into sid from vault.secrets where name = k;
    if sid is null then
      perform vault.create_secret(v, k);
    else
      perform vault.update_secret(sid, v);
    end if;
  end loop;
end $$;

-- ---- Schedules ----

select cron.unschedule('sync-eight-sleep-nightly')
where exists (select 1 from cron.job where jobname = 'sync-eight-sleep-nightly');
select cron.schedule('sync-eight-sleep-nightly', '30 6 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_url'),
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_auth')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);

select cron.unschedule('quarterly-health-push')
where exists (select 1 from cron.job where jobname = 'quarterly-health-push');
select cron.schedule('quarterly-health-push', '0 9 1 1,4,7,10 *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_push_url'),
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_push_auth')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);

select cron.unschedule('cleanup-orphans-daily')
where exists (select 1 from cron.job where jobname = 'cleanup-orphans-daily');
select cron.schedule('cleanup-orphans-daily', '0 4 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_orphans_url'),
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_orphans_auth')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);

-- Verify what's scheduled:
select jobname, schedule, active from cron.job order by jobname;
