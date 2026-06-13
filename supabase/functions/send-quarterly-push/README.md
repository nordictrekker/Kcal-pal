# send-quarterly-push Edge Function

Sends "Time to re-export Apple Health" to all of the allowed user's push
subscriptions. Triggered quarterly by pg_cron.

## Deploy (dashboard)

1. Edge Functions → Deploy a new function → name `send-quarterly-push`
2. Paste `index.ts`
3. Set secrets (Project Settings → Edge Functions → Secrets):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
   - `ALLOWED_EMAIL`
   - `SUPABASE_SERVICE_ROLE_KEY` (custom secret = your `sb_secret_*` key,
     since legacy JWT keys are disabled)
4. Turn **Verify JWT off** for this function (the cron calls it with the
   sb_secret_* key, which isn't a JWT — auth is enforced inside the function).

## Schedule

Open `supabase/migrations/0004_quarterly_push_cron.sql`, populate the Vault
secrets it references, then run it in the SQL Editor.

## Test

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_push_url'),
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'quarterly_push_auth')
  ),
  body := '{}'::jsonb
);
-- then:
select id, status_code, content from net._http_response order by id desc limit 1;
```

Expect `{"ok":true,"sent":N}`.
