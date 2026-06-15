"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

function reject(reason: string, email?: string): never {
  const params = new URLSearchParams({ error: reason });
  if (email) {
    params.set("sent", "1");
    params.set("email", email);
  }
  redirect(`/login?${params.toString()}`);
}

// Send the standard Supabase magic-link email.
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const allowed = allowedEmail();
  if (!allowed) reject("Server misconfigured: ALLOWED_EMAIL unset");
  if (email !== allowed) reject("Not authorized");

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "http://localhost:3000";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) reject(error.message);

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}

// Verify by extracting the hashed token from a pasted magic-link URL.
// This sidesteps the iOS PWA cookie-isolation issue: instead of clicking
// the link (which opens Safari, separate cookie jar), the user
// long-presses → Copy Link → pastes into the PWA, and we verify the
// token_hash directly from within the PWA's own context. No PKCE
// verifier required.
export async function verifyMagicLinkUrl(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pasted = String(formData.get("url") ?? "").trim();
  const allowed = allowedEmail();

  if (!allowed) reject("Server misconfigured: ALLOWED_EMAIL unset");
  if (!pasted) reject("Paste the sign-in link from your email.", email);

  let parsed: URL;
  try {
    parsed = new URL(pasted);
  } catch {
    reject("That doesn't look like a valid URL.", email);
  }

  // Accept both the Supabase verify URL (?token=hash) and a fallback for
  // pre-resolved callback URLs (?code= — PKCE; would fail on free tier
  // iOS PWA anyway, included for desktop completeness).
  const tokenHash = parsed.searchParams.get("token");
  const code = parsed.searchParams.get("code");
  // The email link carries its own `type` (magiclink / signup / email /
  // recovery / invite). verifyOtp rejects with "invalid or expired" if the
  // type we pass doesn't match what the token was issued for — first-time
  // sign-ups send `signup`, return logins send `magiclink`. Read it from
  // the URL instead of hard-coding.
  const urlType = parsed.searchParams.get("type") ?? "";
  const validTypes = ["magiclink", "signup", "email", "recovery", "invite"] as const;
  type VerifyType = (typeof validTypes)[number];
  const candidateTypes: VerifyType[] = validTypes.includes(urlType as VerifyType)
    ? [urlType as VerifyType]
    : ["magiclink", "signup", "email"]; // fall back if type missing

  const supabase = await createClient();

  if (tokenHash) {
    let lastError: string | null = null;
    for (const type of candidateTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (error || !data.user) {
        lastError = error?.message ?? "Verification failed.";
        // "invalid or expired" can mean wrong type; keep trying candidates.
        continue;
      }
      const userEmail = (data.user.email ?? "").trim().toLowerCase();
      if (userEmail !== allowed) {
        await supabase.auth.signOut();
        reject("Not authorized");
      }
      redirect("/today");
    }
    reject(lastError ?? "Verification failed.", email);
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      reject(error?.message ?? "Verification failed.", email);
    }
    const userEmail = (data.user!.email ?? "").trim().toLowerCase();
    if (userEmail !== allowed) {
      await supabase.auth.signOut();
      reject("Not authorized");
    }
    redirect("/today");
  }

  reject("Couldn't find a sign-in token in that URL.", email);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
