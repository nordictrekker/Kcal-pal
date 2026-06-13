# Kcal-pal — Setup & Deploy

Everything the code can't do itself: secrets, migrations, edge-function
deploys, and cron. The app (Phases 1–10) is built and pushed; this wires up
the backend pieces.

## 1. Vercel environment variables

Project → Settings → Environment Variables. Add each, then redeploy.

| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nrfvsfmhzrkrokzzupen.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_…` key |
| `ANTHROPIC_API_KEY` | `sk-ant-…` |
| `ALLOWED_EMAIL` | `juliefloodreiff@gmail.com` |
| `VAPID_PUBLIC_KEY` | `BB8GZeGSLaoTL7spt_Cw0_ie4BJMpgZrYYv2R68fhmKI2MDRjLuc2wTBQLxnUBJ6defWAYXI13uPSVeGxK3o81o` |
| `VAPID_PRIVATE_KEY` | `jywx9WEBu7vtbGu-c_FSey-7dlvNbc8mK_soKCFqq6Q` |
| `VAPID_SUBJECT` | `mailto:juliefloodreiff@gmail.com` |
| `OURA_PERSONAL_ACCESS_TOKEN` | (optional) Oura PAT for the Sync now button |
| `EIGHT_SLEEP_EMAIL` / `EIGHT_SLEEP_PASSWORD` | (optional) Eight Sleep login |

> The VAPID keypair above was generated for this project. Rotate with
> `npx web-push generate-vapid-keys` if it's ever exposed.

## 2. Database migrations (Supabase SQL Editor)

Run in order. All are idempotent (safe to re-run).

- `0001_init.sql` — already applied.
- The cron migrations (`0002`–`0005`) each need Vault secrets created first
  and an edge function deployed. See sections below.

## 3. Edge Functions

Deploy each via Dashboard → Edge Functions → Deploy a new function (paste the
matching `supabase/functions/<name>/index.ts`). For **every** function, turn
**Verify JWT OFF** (they authenticate with the `sb_secret_*` key, which isn't
a JWT; auth is enforced inside each function).

| Function | Secrets (Edge Functions → Secrets) |
|---|---|
| `sync-oura` | `OURA_PERSONAL_ACCESS_TOKEN`, `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`=`sb_secret_…` |
| `sync-eight-sleep` | `EIGHT_SLEEP_EMAIL`, `EIGHT_SLEEP_PASSWORD`, `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `send-quarterly-push` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `cleanup-orphans` | `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |

`sync-oura` is already deployed and working.

## 4. Cron jobs (Vault + migration per function)

For each function you want scheduled, first store its URL + auth in Vault,
then run the cron migration. Pattern (swap the names per function):

```sql
-- once per function
select vault.create_secret(
  'https://nrfvsfmhzrkrokzzupen.supabase.co/functions/v1/<function-name>',
  '<name>_url'
);
select vault.create_secret('<sb_secret_… key>', '<name>_auth');
```

| Migration | Vault names | Schedule |
|---|---|---|
| `0002_oura_cron.sql` | `sync_oura_url` / `sync_oura_auth` | 6:00 UTC daily ✓ done |
| `0003_eight_sleep_cron.sql` | `sync_eight_sleep_url` / `sync_eight_sleep_auth` | 6:30 UTC daily |
| `0004_quarterly_push_cron.sql` | `quarterly_push_url` / `quarterly_push_auth` | 09:00 UTC, 1st of Jan/Apr/Jul/Oct |
| `0005_cleanup_cron.sql` | `cleanup_orphans_url` / `cleanup_orphans_auth` | 4:00 UTC daily |

Test any function manually:

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '<name>_url'),
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '<name>_auth')
  ),
  body := '{}'::jsonb
);
select id, status_code, content from net._http_response order by id desc limit 1;
```

## 5. PWA / notifications (on the phone)

1. Open the Vercel URL in iOS Safari → Share → **Add to Home Screen**.
2. Open the app from the home-screen icon (notifications only work in the
   installed PWA on iOS).
3. Settings → **Enable notifications** → **Send test**. Confirm the banner.
4. Deploy `send-quarterly-push` + run `0004` for the automatic quarterly
   reminder.

## Feature → route map

| Feature | Route |
|---|---|
| Dashboard (food, sleep, HRV, readiness, cycle) | `/today` |
| Log via text | `/log` |
| Barcode scan | `/log/scan` |
| Photo log | `/log/photo` |
| Weekly averages + correlation | `/weekly` |
| Apple Health import | `/import` |
| Install, notifications, dark mode | `/settings` |
