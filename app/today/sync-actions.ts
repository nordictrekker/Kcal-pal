"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchOuraDaily } from "@/lib/oura";
import { fetchEightSleepDaily } from "@/lib/eight-sleep";

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
    const rows = await fetchOuraDaily(token, 7);
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

export async function syncEightSleep(): Promise<SyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const email = process.env.EIGHT_SLEEP_EMAIL;
  const password = process.env.EIGHT_SLEEP_PASSWORD;
  if (!email || !password) {
    return {
      ok: false,
      error:
        "EIGHT_SLEEP_EMAIL/PASSWORD not set. Add them in Vercel env vars and redeploy.",
    };
  }

  try {
    const rows = await fetchEightSleepDaily({ email, password });
    if (rows.length === 0) {
      return { ok: true, daysSynced: 0 };
    }
    const withUser = rows.map((r) => ({ ...r, user_id: user.id }));

    const { error } = await supabase
      .from("eight_sleep_daily")
      .upsert(withUser, { onConflict: "user_id,date" });

    if (error) return { ok: false, error: error.message };

    revalidatePath("/today");
    return { ok: true, daysSynced: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eight Sleep sync error";
    return { ok: false, error: msg };
  }
}
