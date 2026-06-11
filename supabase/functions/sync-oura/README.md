# sync-oura Edge Function

Pulls the last 7 days of Oura data into `oura_daily`. Triggered:
- **Nightly at 6 UTC** by pg_cron (see `../../migrations/0002_oura_cron.sql`).
- **Manually** by the "Sync now" button on `/today` (which uses a Vercel server
  action that calls Oura directly — no edge-function round-trip needed).

So: the manual button works the moment `OURA_PERSONAL_ACCESS_TOKEN` is set on
Vercel. The edge function is only needed for the cron path.

## Deploy paths

### Option A — Supabase Dashboard (no CLI)

1. Supabase dashboard → **Edge Functions** → **Deploy a new function**
2. Name: `sync-oura`
3. Paste the contents of `index.ts`
4. Click **Deploy function**
5. Then **Project Settings → Edge Functions → Secrets** and add:
   - `OURA_PERSONAL_ACCESS_TOKEN` = your Oura PAT
   - `ALLOWED_EMAIL` = your login email (lowercase)

### Option B — Supabase CLI

```sh
npm install -g supabase    # or `brew install supabase/tap/supabase`
supabase login
supabase link --project-ref <PROJECT-REF>
supabase secrets set \
  OURA_PERSONAL_ACCESS_TOKEN=<your-PAT> \
  ALLOWED_EMAIL=<your-email>
supabase functions deploy sync-oura
```

## After deploy: schedule the cron job

Open `supabase/migrations/0002_oura_cron.sql`, replace `<PROJECT-REF>` and
`<SERVICE-ROLE-KEY>`, paste into the Supabase SQL Editor, Run.

## Test

```sh
curl -X POST \
  -H "Authorization: Bearer <SERVICE-ROLE-KEY>" \
  https://<PROJECT-REF>.supabase.co/functions/v1/sync-oura
```

Expect: `{"ok":true,"days_synced":7}` (or fewer days if Oura hasn't exported
the most recent night yet).
