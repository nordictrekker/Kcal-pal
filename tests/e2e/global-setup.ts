import { createServerClient } from "@supabase/ssr";
import { writeFileSync } from "node:fs";

// Seeds a signed-in Playwright session so the authenticated E2E specs run on the
// real Chrome + Safari engines in CI. Sign-in is email-OTP (can't be automated
// headlessly), so this uses password sign-in against a test account: set
// E2E_TEST_EMAIL + E2E_TEST_PASSWORD (CI secrets) for an account that has a
// password (e.g. add one to the allowed account in the Supabase dashboard).
//
// Without those env vars it does nothing, so the authenticated specs skip and
// CI stays green. The auth cookies are produced by @supabase/ssr's own
// serialization (via the setAll adapter), so their format matches exactly what
// the app reads server-side — no hand-rolled cookie strings.
export const AUTH_STATE = "e2e-auth.json";

export default async function globalSetup() {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !password || !url || !anon) return;

  const captured: { name: string; value: string }[] = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => [],
      setAll: (toSet) => {
        for (const c of toSet) captured.push({ name: c.name, value: c.value });
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`E2E sign-in failed: ${error.message}`);

  const host = new URL(
    process.env.E2E_BASE_URL ?? "http://localhost:3000",
  ).hostname;
  const state = {
    cookies: captured.map((c) => ({
      name: c.name,
      value: c.value,
      domain: host,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  };
  writeFileSync(AUTH_STATE, JSON.stringify(state));
}
