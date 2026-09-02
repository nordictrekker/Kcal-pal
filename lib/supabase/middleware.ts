import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/health/ingest") || // token-authed inside the route
    path.startsWith("/api/cron/") || // CRON_SECRET-authed inside the route
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  // Public paths don't need the signed-in user, so skip the Supabase auth
  // revalidation round trip entirely (it only short-circuits without a network
  // call when there's no session; for a signed-in user this saves an RTT).
  if (isPublic) return supabaseResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() verifies the JWT locally (WebCrypto against the cached JWKS)
  // instead of asking the auth server on every request, while still going
  // through getSession() so an expired token is refreshed and the rotated
  // cookies are written by the setAll adapter above. On a symmetric-secret
  // project it falls back to the same getUser() call this used to make.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
