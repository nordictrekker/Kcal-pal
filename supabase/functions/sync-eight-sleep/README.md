# sync-eight-sleep Edge Function

Pulls recent Eight Sleep intervals into `eight_sleep_daily`. **Unofficial
API** — uses the auth flow from the pyEight library
(https://github.com/mezz64/pyEight). Eight Sleep has rotated this before;
if the function returns an auth error, the credentials in `lib/eight-sleep.ts`
and the matching values in the edge function need updating from pyEight.

## Deploy

Same as sync-oura. Dashboard:
1. Edge Functions → Deploy a new function → name `sync-eight-sleep`
2. Paste `index.ts`
3. Set secrets in Project Settings → Edge Functions:
   - `EIGHT_SLEEP_EMAIL`
   - `EIGHT_SLEEP_PASSWORD`
   - `ALLOWED_EMAIL`

## Schedule

Open `supabase/migrations/0003_eight_sleep_cron.sql`, replace placeholders,
paste into SQL Editor, Run. Cron is 6:30 UTC (offset from Oura).
