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
| `USDA_FDC_API_KEY` | (optional) FoodData Central key for real micronutrients. [Free signup](https://fdc.nal.usda.gov/api-key-signup.html); leave blank for AI-only micros. |
| `ALLOWED_EMAIL` | `juliefloodreiff@gmail.com` |
| `VAPID_PUBLIC_KEY` | `BB8GZeGSLaoTL7spt_Cw0_ie4BJMpgZrYYv2R68fhmKI2MDRjLuc2wTBQLxnUBJ6defWAYXI13uPSVeGxK3o81o` |
| `VAPID_PRIVATE_KEY` | `jywx9WEBu7vtbGu-c_FSey-7dlvNbc8mK_soKCFqq6Q` |
| `VAPID_SUBJECT` | `mailto:juliefloodreiff@gmail.com` |
| `OURA_PERSONAL_ACCESS_TOKEN` | (optional) Oura PAT for the Sync now button |
| `HEALTH_INGEST_TOKEN` | Bearer token the iOS Shortcut sends to `/api/health/ingest`. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |

> The VAPID keypair above was generated for this project. Rotate with
> `npx web-push generate-vapid-keys` if it's ever exposed.

## 1b. Auth email template — REQUIRED (code-based sign-in)

Sign-in uses a **6-digit code**, not a clickable link. This is deliberate:
mail providers (Gmail, Apple Mail, security scanners) pre-fetch any link in
an email, which silently performs the `GET /auth/v1/verify` and burns the
single-use token *seconds before* you can use it — the cause of the
recurring "Email link is invalid or has expired" error. The link's token and
the 6-digit code are the **same** one-time token, so the email must contain
**only the code and no link**.

Supabase Dashboard → **Authentication → Email Templates → Magic Link**, and
replace the body with:

```html
<h2>Your Kcal-pal sign-in code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>The code expires in about an hour. If you didn't request it, ignore this email.</p>
```

Do **not** include `{{ .ConfirmationURL }}` (or any other link to the verify
endpoint) — that reintroduces the prefetch problem. Optionally raise the OTP
expiry under Authentication → Providers → Email if an hour is too short.

## 2. Database migrations (Supabase SQL Editor)

Run in order. All are idempotent (safe to re-run).

- `0001_init.sql` — already applied.
- The cron migrations (`0002`–`0005`) each need Vault secrets created first
  and an edge function deployed. See sections below.
- Feature migrations (`0006`–`0023`) add tables/columns and RLS for hydration,
  digests, onboarding, recipes, nutrients, the USDA `fdc_cache`, `food_insights`,
  a rejected-location marker, and `trans_fat_g`. With the Supabase MCP connected,
  apply them directly with `apply_migration` (then `get_advisors` to verify)
  instead of the SQL Editor.

## 3. Edge Functions

Deploy each via Dashboard → Edge Functions → Deploy a new function (paste the
matching `supabase/functions/<name>/index.ts`). For **every** function, turn
**Verify JWT OFF** (they authenticate with the `sb_secret_*` key, which isn't
a JWT; auth is enforced inside each function).

| Function | Secrets (Edge Functions → Secrets) |
|---|---|
| `sync-oura` | `OURA_PERSONAL_ACCESS_TOKEN`, `ALLOWED_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`=`sb_secret_…` |
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
| `0004_quarterly_push_cron.sql` | `quarterly_push_url` / `quarterly_push_auth` | 09:00 UTC, 1st of Jan/Apr/Jul/Oct |
| `0005_cleanup_cron.sql` | `cleanup_orphans_url` / `cleanup_orphans_auth` | 4:00 UTC daily |
| `0006_drop_eight_sleep.sql` | — | (one-shot cleanup, no cron) |

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

## Apple Health auto-push (iOS Shortcut)

Replaces the third-party Health Auto Export app. A Shortcut on your phone
reads HealthKit and POSTs to `/api/health/ingest`. Schedule it via a
Shortcuts Automation and quarterly imports run by themselves.

### One-time: build the Shortcut

1. iPhone → **Shortcuts** app → **+** to create a new Shortcut → name it
   "Send Health to Kcal-pal".
2. Add a **Dictionary** action. Set Type to **Array**, then add one
   Dictionary item per metric. For each item, add three keys:
   - `metric` (Text) — e.g. `body_mass`, `body_fat_percentage`,
     `resting_heart_rate`, `step_count`, `active_energy_burned`, `vo2max`.
     The endpoint normalizes these names; case/punctuation don't matter.
   - `value` (Number) — wire to a **Find Health Samples** action for that
     metric, set "Limit" to 1, sort "Latest First", then use the
     `Quantity` magic variable.
   - `recorded_at` (Text) — use the `Start Date` magic variable from the
     same Find action, formatted as ISO 8601.
3. Wrap the array in another **Dictionary** with one key `samples` whose
   value is the array.
4. Add a **Get Contents of URL** action:
   - URL: copy from **/settings → Apple Health auto-push → POST URL**
   - Method: **POST**
   - Request Body: **JSON**, set to the wrapped dictionary
   - Headers: add one — `Authorization` = paste from **/settings → Apple
     Health auto-push → Authorization header**
5. Add a **Show Result** action (so you can confirm the response on the
   first run); remove after testing.
6. Run the Shortcut. Expect `{ "ok": true, "imported": N, … }`.

### Schedule it

In Shortcuts → **Automation** tab → **+** → **Time of Day** → pick a
quarterly cadence (or monthly if you want fresher data) → **Run Shortcut**
→ choose this one. Toggle **Run Immediately** off only if you want to be
prompted; on for fire-and-forget.

### What the endpoint accepts

`POST /api/health/ingest` (Authorization: `Bearer $HEALTH_INGEST_TOKEN`),
JSON body either:

```json
{ "samples": [
  { "metric": "body_mass", "value": 165, "unit": "lb",
    "recorded_at": "2026-06-13T07:00:00Z" }
] }
```

…or the metric-grouped form (`{ "metrics": [{ "name": "...", "data": [...] }] }`)
which is identical to the Health Auto Export JSON shape, so the same
endpoint can also receive HAE if you ever want the fallback.

Idempotent: re-pushing the same samples is a no-op (upsert on
`user_id + metric + recorded_at`).

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
