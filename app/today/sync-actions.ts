"use server";

import { requireUser, revalidatePaths } from "@/lib/actions";
import { fetchOuraDaily } from "@/lib/oura";

export type SyncResult = {
  ok: boolean;
  daysSynced?: number;
  error?: string;
};

export async function syncOura(): Promise<SyncResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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

    revalidatePaths("/today", "/weekly", "/recap");
    return { ok: true, daysSynced: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    return { ok: false, error: msg };
  }
}
