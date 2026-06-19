#!/usr/bin/env node
// Route-level smoke test: every route returns its expected status against a
// running server. Catches broken routes, accidental auth-gate changes, and
// missing redirects without needing a browser or a session.
//
//   npx next start -p 3102   # with .env.local pointing at Supabase
//   node scripts/smoke.mjs http://localhost:3102
//
// Unauthenticated expectations: public pages render (200); gated pages redirect
// to /login (307); the token-authed ingest endpoint rejects (401).
//
// .env.local needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to
// boot, plus HEALTH_INGEST_TOKEN, ALLOWED_EMAIL, SUPABASE_SERVICE_ROLE_KEY
// (dummy values are fine) so the ingest route reaches its 401 auth check
// instead of the "server misconfigured" 500.

const base = process.argv[2] ?? "http://localhost:3102";

const cases = [
  // public — render
  ["/login", [200]],
  ["/manifest.webmanifest", [200]],
  ["/icon.svg", [200]],
  // auth-gated — redirect to /login when signed out
  ["/", [307, 302]],
  ["/today", [307, 302]],
  ["/today/summary", [307, 302]],
  ["/log", [307, 302]],
  ["/log/scan", [307, 302]],
  ["/log/photo", [307, 302]],
  ["/recipes", [307, 302]],
  ["/weekly", [307, 302]],
  ["/recap", [307, 302]],
  ["/settings", [307, 302]],
  ["/onboarding", [307, 302]],
  ["/reanalyze", [307, 302]],
  ["/import", [307, 302]],
  // token-authed API — rejects without a bearer token
  ["/api/health/ingest", [401, 405, 400], "POST"],
];

let failed = 0;
for (const [path, ok, method = "GET"] of cases) {
  let status = 0;
  try {
    const res = await fetch(base + path, { method, redirect: "manual" });
    status = res.status;
  } catch (e) {
    console.log(`✗ ${method} ${path} — request failed: ${e.message}`);
    failed++;
    continue;
  }
  const pass = ok.includes(status);
  console.log(`${pass ? "✓" : "✗"} ${method} ${path} → ${status} ${pass ? "" : `(expected ${ok.join("/")})`}`);
  if (!pass) failed++;
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${cases.length - failed}/${cases.length} routes`);
process.exit(failed === 0 ? 0 : 1);
