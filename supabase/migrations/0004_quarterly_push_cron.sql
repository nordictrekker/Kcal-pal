-- Schedule quarterly Apple Health re-export reminder push.
-- Reads URL + auth from Supabase Vault. Run AFTER deploying the
-- send-quarterly-push Edge Function.
--
-- BEFORE running this migration, add the secrets to Vault (run once via
-- SQL Editor — do not commit these calls):
--
--   select vault.create_secret(
--     'https://<PROJECT-REF>.supabase.co/functions/v1/send-quarterly-push',
--     'quarterly_push_url'
--   );
--   select vault.create_secret(
--     '<SERVICE-ROLE-KEY>',
--     'quarterly_push_auth'
--   );

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('quarterly-health-push')
where exists (select 1 from cron.job where jobname = 'quarterly-health-push');

-- 9:00 (server time, UTC) on the 1st of Jan, Apr, Jul, Oct.
select cron.schedule(
  'quarterly-health-push',
  '0 9 1 1,4,7,10 *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'quarterly_push_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'quarterly_push_auth'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
