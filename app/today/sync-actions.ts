"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchOuraDaily } from "@/lib/oura";

export type SyncResult = {
  ok: boolean;
  daysSynced?: number;
  error?: string;
};

export async function syncOura(): Promise<SyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const token = process.env.OURA_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    return {
      ok: false,
      error:
        "OURA_PERSONAL_ACCESS_TOKEN is not configured. Add it in Vercel env vars and redeploy.",
    };
  }

  try {
    const rows = await fetchOuraDaily(token, 14);
    const withUser = rows.map((r) => ({ ...r, user_id: user.id }));

    const { error } = await supabase
      .from("oura_daily")
      .upsert(withUser, { onConflict: "user_id,date" });

    if (error) return { ok: false, error: error.message };

    revalidatePath("/today");
    return { ok: true, daysSynced: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    return { ok: false, error: msg };
  }
}
