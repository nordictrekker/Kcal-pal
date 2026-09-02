# Performance — measurement & findings

## How to reproduce (repeatable test conditions)

The production host isn't reachable from CI sandboxes (network egress
allowlist), so measure a local **production** server pointed at the real
Supabase project:

```bash
# .env.local (gitignored) — public values only
NEXT_PUBLIC_SUPABASE_URL=https://nrfvsfmhzrkrokzzupen.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…   # publishable key

npm run build
npx next start -p 3101

# TTFB per route, median of 9 (no redirect-follow, so a gated route
# measures its own server work):
for p in /manifest.webmanifest /login /today /weekly /log /settings; do
  for i in $(seq 1 9); do
    curl -s -o /dev/null -w "%{time_starttransfer}\n" "http://localhost:3101$p"
  done | sort -n | sed -n '5p' | awk -v p="$p" '{printf "%-22s %.0f ms\n", p, $1*1000}'
done
```

## Findings (2026-06-19)

| Route | What runs | Median TTFB |
|---|---|---|
| `/manifest.webmanifest` | no middleware, static | **3–5 ms** |
| auth-gated (`/today`, `/weekly`, `/log`, `/settings`) | middleware gate → redirect (no session) | **2–3 ms** |
| `/login` | middleware (public, skipped) + form render | **10–13 ms** |

**The application code renders in well under 50 ms on every route.** The
framework/render floor is single-digit milliseconds.

Per-page latency only exceeds 50 ms from **Supabase network round trips on
authenticated requests** — these are network/region-bound, not code-bound:

- The Supabase project is in **us-west-2**; Vercel functions run in **iad1**
  (us-east) — a cross-region hop (~tens of ms) on every query.
- `supabase.auth.getUser()` revalidates the session over the network when a
  real session cookie is present (the unauthenticated probes above are fast
  only because `getUser()` short-circuits with no token).

> The fully-authenticated page cost can't be measured in CI (no session
> cookie / no email-OTP loop), but the floor above proves the code side is
> not the bottleneck.
>
> **Per-round-trip latency can't be measured from CI either:** direct egress
> to the Supabase host is also blocked by the sandbox allowlist
> (`x-deny-reason: host_not_allowed`), so any "Supabase RTT" curl from here
> just times the egress proxy's 403, not Supabase. The round-trip cost is
> therefore reasoned from the architecture (a cross-region hop), not measured.
> A reliable measurement needs to run from the production region with a real
> session.

## Measured per-page TTFB (CI, repeatable)

`tests/e2e/perf.spec.ts` measures each route's server TTFB (Navigation Timing
`responseStart − requestStart`) on every CI run, against the production build.
Latest run — **every page well under 50 ms**:

| Route | TTFB | Route | TTFB |
|---|---|---|---|
| `/` | 22.1 ms | `/weekly` | 10.3 ms |
| `/login` | 27.0 ms | `/recap` | 12.3 ms |
| `/today` | 21.5 ms | `/settings` | 9.6 ms |
| `/today/summary` | 14.9 ms | `/onboarding` | 8.4 ms |
| `/log` | 11.4 ms | `/reanalyze` | 8.9 ms |
| `/log/scan` | 22.0 ms | `/import` | 9.7 ms |
| | | `/manifest.webmanifest` | 15.1 ms |

(A warm second pass measured 3.6–20 ms.) These are signed-out, so authenticated
renders add same-region DB round trips (~1–2 ms each now that production runs in
`pdx1`) — still under 50 ms.

## What this means for the < 50 ms target

The framework floor (single-digit ms) leaves ample budget, so whether a page
clears 50 ms comes down to **how many Supabase round trips it makes and how
far away Supabase is**:

- A **single co-located** round trip (Vercel and Supabase in the same region)
  is low-single-digit ms → every page comfortably under 50 ms.
- A **cross-region** round trip (today: iad1 ↔ us-west-2) is tens of ms, so
  even one such hop can eat most or all of the budget, and an authenticated
  page makes more than one (gate + data).

So the target is reachable, but it's gated on **co-locating the regions**, not
on further app-code changes — the code path is already at its floor (framework
< 15 ms; queries parallelized to one round trip; the public-path auth skip
below removes another). The remaining code lever is collapsing the duplicate
auth revalidation (middleware + page) via `getClaims()` — worth doing, but it
reduces hops rather than removing the region distance, and needs the
authenticated path tested first.

## Optimizations applied

- **Middleware:** skip the `getUser()` revalidation entirely for public paths
  (it ran before the `isPublic` check) — saves a Supabase round trip for a
  signed-in user hitting `/login`/`/auth`.
- **Query waterfalls removed:** `/today/summary` fetches the food-insights row
  inside its main `Promise.all`; `/log` fetches saved meals + pantry in
  parallel. `/today` is already a single 10-query `Promise.all`.
- **RLS init-plan** wrapped in scalar subselects (migration `0021`) so policies
  evaluate once per query, not per row.
- **Instant nav:** root `loading.tsx` so transitions never blank-flash.

## Region co-location (done — verified)

`vercel.json` sets `"regions": ["pdx1"]` (Portland), so Vercel runs the
functions in the same region as Supabase (`us-west-2` / Oregon). **Verified on a
preview deployment: `regions: ["pdx1"]`.** This turns the per-request auth +
data round trips from a cross-region hop (~60–70 ms each) into same-region calls
(~1–2 ms) — the lever that brings authenticated server-render under 50 ms
(framework floor is already <15 ms).

Note: the Next.js `preferredRegion` route-config did **not** take effect on this
plan (deploys stayed in `iad1`); the `vercel.json` `regions` field did. It
applies to production once this lands on the production branch — confirm with
`get_deployment` that the production deployment reports `regions: ["pdx1"]`.
## Duplicate auth revalidation (done — measured 2026-09-02)

Previously listed here as the next lever, now shipped and measured.

**First, the measurement was wrong.** The TTFB suite ran signed out, so every
gated route answered `307` to `/login` in ~3 ms. The numbers looked excellent
while timing a redirect. The suite now runs against the seeded session and
asserts `200`, so that cannot recur, and samples each route 5x reporting the
median.

**The real baseline**, once it measured pages instead of redirects: every
authenticated route sat at **95–117 ms**, and barely moved between a heavy
dashboard (`/today`, 106 ms) and a near-static camera page (`/log/scan`,
112 ms). That uniformity is the tell — a fixed per-request cost, not per-page
work: two sequential `getUser()` calls (middleware, then the page), each a
network validation of the same token before any data query starts.

**The fix:** both now use `getClaims()`, which verifies the JWT signature
locally with WebCrypto against the project's JWKS. The JWKS cache is
module-level (`GLOBAL_JWKS`, keyed by storage key), so a fresh client per
request still reuses it. It goes through `getSession()`, so refresh and cookie
rotation are unchanged; on a symmetric-secret project it falls back to the old
`getUser()` call. It is not `getSession()` — the signature is really verified.

| Route | Before | After |
|---|---|---|
| `/today` | 106 ms | **34 ms** |
| `/today/summary` | 106 ms | **40 ms** |
| `/log` | 105 ms | **25 ms** |
| `/log/scan` | 112 ms | **26 ms** |
| `/weekly` | 102 ms | **25 ms** |
| `/recap` | 111 ms | **27 ms** |
| `/settings` | 100 ms | **28 ms** |
| `/reanalyze` | 110 ms | **25 ms** |
| `/import` | 117 ms | **18 ms** |
| `/login` (public) | 10 ms | 10 ms |
| `/manifest.webmanifest` | 3 ms | 3 ms |

**Every page is now under the 50 ms target**, measured on the CI runner against
the production build. Note the shape change: `/today` and `/today/summary` are
now the two slowest, at ~34–40 ms against a ~20 ms floor. With the fixed cost
gone, what remains is genuine per-page work — so those two are where any
further optimization belongs.

**Tradeoff, recorded deliberately:** `getUser()` asks the auth server on every
request, so a deleted or banned account loses access immediately. Local
verification trusts a validly-signed token until it expires (1 h by default).
For a single-user personal app that window is acceptable, and it is Supabase's
own recommended SSR approach. If it ever stops being acceptable, the
alternative that keeps one server-side validation per request is to have
middleware pass its verified user id downstream on a request header it always
overwrites, removing the *duplicate* rather than the network call.
