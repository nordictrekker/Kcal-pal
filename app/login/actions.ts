"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Comma-separated allowlist (e.g. "a@x.com,b@y.com"). The var name stays
// ALLOWED_EMAIL for compatibility with the existing deployment config.
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function reject(reason: string, email?: string): never {
  const params = new URLSearchParams({ error: reason });
  if (email) {
    params.set("sent", "1");
    params.set("email", email);
  }
  redirect(`/login?${params.toString()}`);
}

// Email a one-time sign-in CODE (not a clickable link).
//
// Why a code and not a link: the magic-link token is single-use, and the
// `token=` in the email's verify URL is the *same* one-time token as the
// 6-digit code. Mail providers (Gmail, Apple Mail, corporate scanners)
// pre-fetch any link in the email for preview/security, which silently
// performs the GET /verify and burns the token seconds before the user can
// act — producing "Email link is invalid or has expired". A bare numeric
// code can't be prefetched, so it survives until the user types it.
//
// IMPORTANT: this requires the Supabase "Magic Link" email template to show
// {{ .Token }} and contain NO {{ .ConfirmationURL }} link (see SETUP.md).
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const allowed = allowedEmails();
  if (allowed.size === 0) reject("Server misconfigured: ALLOWED_EMAIL unset");
  if (!allowed.has(email)) reject("Not authorized");

  const supabase = await createClient();
  // No emailRedirectTo: we verify the code in-app, never via a redirect.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) reject(error.message);

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}

// Finish sign-in by verifying the one-time CODE the user typed from their
// email. We verify in-app (server action → verifyOtp), so there is no
// redirect and no Safari/PWA cookie-jar split: the session cookie is set on
// the same origin the user is already on.
//
// For resilience we also accept a pasted verify URL (?token=hash) as a
// fallback, in case an older email with a link is used.
export async function verifyMagicLinkUrl(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const raw = String(formData.get("code") ?? formData.get("url") ?? "").trim();
  const allowed = allowedEmails();

  if (allowed.size === 0) reject("Server misconfigured: ALLOWED_EMAIL unset");
  if (!allowed.has(email)) reject("Not authorized", email);
  if (!raw) reject("Enter the 6-digit code from your email.", email);

  const supabase = await createClient();

  // verifyOtp rejects with "invalid or expired" when the type doesn't match
  // what the token was issued for (return logins → magiclink/email,
  // first-time → signup), so try the plausible types in order.
  const candidateTypes = ["email", "magiclink", "signup"] as const;

  // Case 1: a numeric code (the normal path). Supabase OTP length is
  // configurable (6–10 digits), so accept any length in that range rather
  // than hard-coding one.
  const digits = raw.replace(/\D/g, "");
  const looksLikeCode =
    !raw.includes("://") && digits.length >= 4 && digits.length <= 10;
  if (/^\d{4,10}$/.test(raw) || looksLikeCode) {
    const token = digits;
    let lastError: string | null = null;
    for (const type of candidateTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      });
      if (error || !data.user) {
        lastError = error?.message ?? "Verification failed.";
        continue;
      }
      const userEmail = (data.user.email ?? "").trim().toLowerCase();
      if (!allowed.has(userEmail)) {
        await supabase.auth.signOut();
        reject("Not authorized");
      }
      redirect("/today");
    }
    reject(lastError ?? "That code didn't work. Request a new one.", email);
  }

  // Case 2 (fallback): a pasted verify URL with ?token=hash.
  let tokenHash: string | null = null;
  try {
    tokenHash = new URL(raw).searchParams.get("token");
  } catch {
    reject("Enter the 6-digit code from your email.", email);
  }
  if (!tokenHash) reject("Enter the 6-digit code from your email.", email);

  let lastError: string | null = null;
  for (const type of candidateTypes) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error || !data.user) {
      lastError = error?.message ?? "Verification failed.";
      continue;
    }
    const userEmail = (data.user.email ?? "").trim().toLowerCase();
    if (!allowed.has(userEmail)) {
      await supabase.auth.signOut();
      reject("Not authorized");
    }
    redirect("/today");
  }
  reject(lastError ?? "Verification failed.", email);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
