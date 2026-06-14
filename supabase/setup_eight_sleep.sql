-- One-paste Eight Sleep cron setup.
--
-- BEFORE RUNNING:
--   1. Deploy the sync-eight-sleep Edge Function in the dashboard with
--      Verify JWT OFF and these secrets: EIGHT_SLEEP_EMAIL,
--      EIGHT_SLEEP_PASSWORD, ALLOWED_EMAIL, SUPABASE_SERVICE_ROLE_KEY.
--   2. Find-replace __PASTE_SB_SECRET_KEY__ below with your sb_secret_*
--      key (Project Settings → API → Secret keys → Reveal).
--      It appears once. DO NOT save this file with the key in place.
--
-- Project ref is pre-filled. Idempotent — safe to re-run.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Upsert vault secrets.
do $$
declare
  sid uuid;
  url text := 'https://nrfvsfmhzrkrokzzupen.supabase.co/functions/v1/sync-eight-sleep';
  auth text := '__PASTE_SB_SECRET_KEY__';
begin
  select id into sid from vault.secrets where name = 'sync_eight_sleep_url';
  if sid is null then perform vault.create_secret(url, 'sync_eight_sleep_url');
  else perform vault.update_secret(sid, url);
  end if;

  select id into sid from vault.secrets where name = 'sync_eight_sleep_auth';
  if sid is null then perform vault.create_secret(auth, 'sync_eight_sleep_auth');
  else perform vault.update_secret(sid, auth);
  end if;
end $$;

-- Schedule: 6:30 UTC daily, offset from the Oura sync.
select cron.unschedule('sync-eight-sleep-nightly')
where exists (select 1 from cron.job where jobname = 'sync-eight-sleep-nightly');

select cron.schedule(
  'sync-eight-sleep-nightly',
  '30 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_auth')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify (run after the function is deployed):
-- select net.http_post(
--   url := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_url'),
--   headers := jsonb_build_object('Content-Type','application/json',
--     'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_eight_sleep_auth')),
--   body := '{}'::jsonb);
-- select id, status_code, content from net._http_response order by id desc limit 1;
