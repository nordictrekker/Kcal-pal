"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/actions";
import { isDayKey } from "@/lib/form-values";

// Record whether a given day was fully logged. Days marked "partial"/"skipped"
// are excluded from the adaptive-target engine so an under-logged day can't be
// read as a real deficit.
export async function markDayStatus(
  day: string,
  status: "complete" | "partial" | "skipped",
): Promise<{ ok: boolean }> {
  if (!isDayKey(day)) return { ok: false };

  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("day_log_status")
    .upsert(
      { user_id: user.id, day, status },
      { onConflict: "user_id,day" },
    );
  if (error) return { ok: false };

  revalidatePath("/today");
  return { ok: true };
}
