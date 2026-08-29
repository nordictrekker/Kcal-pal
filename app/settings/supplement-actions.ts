"use server";

import { after } from "next/server";
import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import {
  parseAndStoreSupplementProfile,
  supplementNameKey,
} from "@/lib/supplement-profiles";

export type SupplementResult = ActionResult;

const MAX_ITEMS = 20;
const MAX_LEN = 80;

// Replace the user's supplement list wholesale (the card manages the whole
// list client-side and posts it back on every add/remove).
export async function updateSupplements(
  items: string[],
): Promise<SupplementResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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

  // Which names are new? Those get their label researched once, in the
  // background (after the response), and cached on supplement_profiles so
  // every future one-tap log is instant — no re-analysis.
  const { data: prof } = await supabase
    .from("profiles")
    .select("supplements")
    .eq("user_id", user.id)
    .maybeSingle();
  const before = new Set(
    (Array.isArray(prof?.supplements) ? (prof.supplements as string[]) : []).map(
      supplementNameKey,
    ),
  );
  const added = cleaned.filter((n) => !before.has(supplementNameKey(n)));

  const { error } = await supabase
    .from("profiles")
    .update({ supplements: cleaned })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  if (added.length > 0) {
    const userId = user.id;
    after(async () => {
      for (const name of added) {
        try {
          await parseAndStoreSupplementProfile(supabase, userId, name);
        } catch {
          // Best-effort: the quick-add path parses on demand if this failed.
        }
      }
    });
  }

  revalidatePaths("/settings", "/log");
  return { ok: true };
}
