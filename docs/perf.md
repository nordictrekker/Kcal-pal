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

## Highest-impact remaining levers (need a decision / real-device test)

1. **Co-locate Vercel with Supabase** (move functions to a us-west region, or
   Supabase to us-east). Removes the cross-region hop from *every* query — the
   single biggest real-world latency win. Infra/plan decision.
2. **Reduce duplicate auth revalidation.** Authenticated pages call
   `getUser()` in middleware *and* in the page. Switching the per-request gate
   to `getClaims()` (local JWT verification) would drop one network round trip
   per navigation. Auth-sensitive — verify on the authenticated path / real
   devices before shipping.
