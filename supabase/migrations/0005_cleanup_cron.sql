-- Schedule daily orphan-photo cleanup.
-- Reads URL + auth from Supabase Vault. Run AFTER deploying the
-- cleanup-orphans Edge Function.
--
-- BEFORE running this migration, add the secrets to Vault (run once via
-- SQL Editor — do not commit these calls):
--
--   select vault.create_secret(
--     'https://<PROJECT-REF>.supabase.co/functions/v1/cleanup-orphans',
--     'cleanup_orphans_url'
--   );
--   select vault.create_secret(
--     '<SERVICE-ROLE-KEY>',
--     'cleanup_orphans_auth'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('cleanup-orphans-daily')
where exists (select 1 from cron.job where jobname = 'cleanup-orphans-daily');

-- 4:00 UTC daily, before the integration syncs.
select cron.schedule(
  'cleanup-orphans-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'cleanup_orphans_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cleanup_orphans_auth'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
