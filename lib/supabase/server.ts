import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    },
  );
}

export type AuthedUser = { id: string; email: string | null };

// The signed-in user for a page render, without the per-request round trip to
// the auth server that `getUser()` always makes.
//
// Measured: every authenticated page sat at ~95–117 ms TTFB in CI, and the
// number barely moved between a heavy dashboard (/today) and a near-static
// camera page (/log/scan). That uniformity is a fixed per-request cost, not
// per-page work — two sequential `getUser()` calls (middleware, then the page),
// each a network validation of the same token.
//
// `getClaims()` verifies the JWT signature locally with WebCrypto against the
// project's JWKS (fetched once, then cached) when the project issues
// asymmetric tokens. It still goes through `getSession()`, so token refresh and
// cookie rotation are unchanged, and on a symmetric-secret project it falls
// back to exactly the `getUser()` call we make today — never weaker, never
// slower. It is not `getSession()`: the signature is really verified.
export async function getAuthedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AuthedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub as string,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    },
  );
}
