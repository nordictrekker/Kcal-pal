-- Schedule nightly Oura sync via pg_cron + pg_net.
-- Reads URL + auth from Supabase Vault so this file stays safe to commit.
--
-- BEFORE running this migration, add the secrets to Vault (run once via
-- SQL Editor — do not commit these calls):
--
--   select vault.create_secret(
--     'https://<PROJECT-REF>.supabase.co/functions/v1/sync-oura',
--     'sync_oura_url'
--   );
--   select vault.create_secret(
--     '<SERVICE-ROLE-KEY>',
--     'sync_oura_auth'
--   );
--
-- If a secret already exists, update it with:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'sync_oura_auth'),
--     '<NEW-KEY>'
--   );

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
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'sync_oura_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_oura_auth'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
