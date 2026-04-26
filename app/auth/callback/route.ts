import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/today";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Missing%20code", url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`,
        url,
      ),
    );
  }

  const allowed = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  const userEmail = (data.user.email ?? "").trim().toLowerCase();

  if (!allowed || userEmail !== allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=Not%20authorized", url),
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
