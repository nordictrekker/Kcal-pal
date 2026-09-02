import { createClient } from "@supabase/supabase-js";

// The bug-report smoke test deliberately exercises the real insert path — a
// mocked one would prove nothing — so it writes a genuine row to the
// bug_reports table on every run, once per browser project. Left alone that
// accumulates forever and buries real user reports (it reached 492 rows before
// migration 0030 purged them).
//
// This removes exactly what the smoke test wrote, matching the same prefix the
// spec uses. It runs as the test user via the own-row delete policy added in
// 0030 — no service-role key needed. Missing credentials means the
// authenticated specs never ran, so there is nothing to clean up.
export const E2E_REPORT_PREFIX = "E2E smoke:";

export default async function globalTeardown() {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !password || !url || !anon) return;

  try {
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;

    const { error } = await supabase
      .from("bug_reports")
      .delete()
      .like("message", `${E2E_REPORT_PREFIX}%`);
    if (error) throw error;
  } catch (e) {
    // Never fail the suite on cleanup — the tests themselves already passed or
    // failed on their own merits. Surface it so it doesn't rot silently.
    console.warn(
      `[e2e teardown] could not purge smoke-test bug reports: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}
