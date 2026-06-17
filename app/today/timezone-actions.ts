"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/timezone";

// Record the phone's timezone. A change from a previously-stored zone is
// treated as travel: we keep the old zone and stamp the time so insights can
// note it. No-ops when the zone is unchanged.
export async function reportTimezone(
  tz: string,
): Promise<{ ok: boolean; changed?: boolean }> {
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
  if (current === tz) return { ok: true, changed: false };

  const patch: Record<string, string | null> = {
    timezone: tz,
    timezone_updated_at: new Date().toISOString(),
  };
  // A real change (not the first set) means the user crossed zones.
  if (current) patch.previous_timezone = current;

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);
  if (error) return { ok: false };

  revalidatePath("/today");
  return { ok: true, changed: Boolean(current) };
}
