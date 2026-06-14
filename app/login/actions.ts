"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

function reject(reason: string): never {
  redirect(`/login?error=${encodeURIComponent(reason)}`);
}

// Step 1: send the email. Supabase still emits the magic-link template,
// but we direct the user to use the 6-digit code embedded in that email
// instead of clicking the link — iOS Safari isolates cookies from the
// installed PWA, so the click-link PKCE flow fails inside Add-to-Home-Screen.
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
      // Still set so the magic link works for desktop browsers (where
      // there's no PWA cookie isolation), but the code path is the
      // primary one inside the iOS PWA.
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) reject(error.message);

  // Preserve email in the URL so the verify form is pre-filled.
  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}

// Step 2: verify the 6-digit code typed into the PWA. No external browser
// involved — the auth cookies land in the PWA's own storage.
export async function verifyOtpCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");
  const allowed = allowedEmail();

  if (!allowed) reject("Server misconfigured: ALLOWED_EMAIL unset");
  if (email !== allowed) reject("Not authorized");
  if (!/^\d{6}$/.test(token)) reject("Enter the 6-digit code from your email.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    reject(error?.message ?? "Verification failed.");
  }

  // Belt-and-suspenders: re-check the email matches the allowlist.
  const userEmail = (data.user!.email ?? "").trim().toLowerCase();
  if (userEmail !== allowed) {
    await supabase.auth.signOut();
    reject("Not authorized");
  }

  redirect("/today");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
