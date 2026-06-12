-- Schedule nightly Eight Sleep sync via pg_cron + pg_net.
-- Run AFTER deploying the sync-eight-sleep Edge Function.
--
-- *** REPLACE <PROJECT-REF> AND <SERVICE-ROLE-KEY> BEFORE RUNNING. ***

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('sync-eight-sleep-nightly')
where exists (select 1 from cron.job where jobname = 'sync-eight-sleep-nightly');

-- 6:30 UTC daily, offset from Oura so we don't pile up two requests at once.
select cron.schedule(
  'sync-eight-sleep-nightly',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-eight-sleep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE-ROLE-KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
