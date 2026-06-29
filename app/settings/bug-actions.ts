"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type BugReportState = { ok: boolean; error?: string };

// Store an in-app bug / feedback report. RLS lets a signed-in user insert their
// own; an operator reviews all reports out-of-band (service role).
export async function submitBugReport(
  _prev: BugReportState,
  formData: FormData,
): Promise<BugReportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const message = String(formData.get("message") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  if (message.length < 3) {
    return { ok: false, error: "Please describe the issue (a few words is fine)." };
  }
  if (message.length > 2000) {
    return { ok: false, error: "Please keep it under 2000 characters." };
  }

  const ua = (await headers()).get("user-agent")?.slice(0, 400) ?? null;

  const { error } = await supabase.from("bug_reports").insert({
    user_id: user.id,
    message,
    context: context ? context.slice(0, 500) : null,
    user_agent: ua,
  });
  if (error) return { ok: false, error: "Couldn't submit — please try again." };
  return { ok: true };
}
