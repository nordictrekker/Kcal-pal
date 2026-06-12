-- Schedule nightly Eight Sleep sync via pg_cron + pg_net.
-- Reads URL + auth from Supabase Vault. Run AFTER deploying the
-- sync-eight-sleep Edge Function.
--
-- BEFORE running this migration, add the secrets to Vault (run once via
-- SQL Editor — do not commit these calls):
--
--   select vault.create_secret(
--     'https://<PROJECT-REF>.supabase.co/functions/v1/sync-eight-sleep',
--     'sync_eight_sleep_url'
--   );
--   select vault.create_secret(
--     '<SERVICE-ROLE-KEY>',
--     'sync_eight_sleep_auth'
--   );
--
-- The Oura cron stores the same service role key under a different name
-- ('sync_oura_auth'). They're separate so each function can be rotated or
-- revoked independently — update both if you rotate the service role key.

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
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'sync_eight_sleep_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_eight_sleep_auth'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
