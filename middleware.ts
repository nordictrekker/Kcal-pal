import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude Next internals, the service worker, the manifest, the offline
    // fallback, and static assets so they're served without an auth redirect.
    //
    // offline.html must be here: the service worker precaches it with
    // `cache.add()`, which REJECTS on a redirected response. While it was
    // gated, an install fetched it, got a 307 to /login, and the precache
    // threw — so the offline fallback silently never existed, which is the
    // whole reason it was added.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|html)$).*)",
  ],
};
