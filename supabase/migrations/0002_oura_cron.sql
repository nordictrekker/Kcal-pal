-- Schedule nightly Oura sync via pg_cron + pg_net.
-- Run this AFTER deploying the sync-oura Edge Function (see
-- supabase/functions/sync-oura/README.md).
--
-- *** REPLACE <PROJECT-REF> AND <SERVICE-ROLE-KEY> BELOW BEFORE RUNNING. ***
-- The service role key is visible in the cron.job table to anyone with SQL
-- access. Acceptable for this single-user app; rotate if it ever leaks.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Drop the previous schedule first so this script is rerunnable.
select cron.unschedule('sync-oura-nightly')
where exists (select 1 from cron.job where jobname = 'sync-oura-nightly');

select cron.schedule(
  'sync-oura-nightly',
  '0 6 * * *',  -- 6:00 UTC daily. Pick a time after your sleep data is exported.
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-oura',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
