"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/timezone";

// Record the device's timezone, used only for local time-of-day display
// (greeting, hydration pacing). Travel is detected separately from physical
// IP location with explicit confirmation — the device clock is not a travel
// signal (changing a laptop's clock must not look like a flight).
export async function reportTimezone(tz: string): Promise<{ ok: boolean }> {
  if (!isValidTimeZone(tz)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .single();
  const current = (profile as { timezone: string | null } | null)?.timezone ?? null;
  if (current === tz) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update({ timezone: tz, timezone_updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { ok: false };

  return { ok: true };
}
