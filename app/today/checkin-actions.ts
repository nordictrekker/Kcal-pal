"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Record whether a given day was fully logged. Days marked "partial"/"skipped"
// are excluded from the adaptive-target engine so an under-logged day can't be
// read as a real deficit.
export async function markDayStatus(
  day: string,
  status: "complete" | "partial" | "skipped",
): Promise<{ ok: boolean }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

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
