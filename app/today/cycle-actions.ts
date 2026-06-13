"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPhase, type Phase } from "@/lib/cycle";

export type CycleSaveResult = { ok: boolean; error?: string };

export async function saveCycleDay(args: {
  day: number;
  phase: Phase;
}): Promise<CycleSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!Number.isInteger(args.day) || args.day < 1 || args.day > 99) {
    return { ok: false, error: "Day must be between 1 and 99." };
  }
  if (!isPhase(args.phase)) {
    return { ok: false, error: "Invalid phase." };
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("cycle_days").upsert(
    {
      user_id: user.id,
      date: today,
      cycle_day: args.day,
      phase: args.phase,
    },
    { onConflict: "user_id,date" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/today");
  return { ok: true };
}
