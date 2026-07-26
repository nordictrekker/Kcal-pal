"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SupplementResult = { ok: boolean; error?: string };

const MAX_ITEMS = 20;
const MAX_LEN = 80;

// Replace the user's supplement list wholesale (the card manages the whole
// list client-side and posts it back on every add/remove).
export async function updateSupplements(
  items: string[],
): Promise<SupplementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(items) ? items : []) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().slice(0, MAX_LEN);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(s);
    if (cleaned.length >= MAX_ITEMS) break;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ supplements: cleaned })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/log");
  return { ok: true };
}
