"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  locationFromHeaders,
  offsetDiffHours,
  MIN_TRAVEL_OFFSET_H,
} from "@/lib/travel";

export type TravelPrompt = {
  label: string;
  hours: number;
  direction: "east" | "west";
} | null;

type LocProfile = {
  home_tz: string | null;
  home_label: string | null;
  travel_status: string | null;
};

// Detect physical location from IP geolocation, compare to home, and move the
// travel state machine forward. Never activates travel on its own — at most it
// moves home → pending and returns a prompt for the user to confirm.
export async function syncLocation(): Promise<{
  ok: boolean;
  prompt: TravelPrompt;
}> {
  const h = await headers();
  const loc = locationFromHeaders((k) => h.get(k));
  if (!loc) return { ok: false, prompt: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, prompt: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_tz,home_label,travel_status")
    .eq("user_id", user.id)
    .single();
  const p = profile as LocProfile | null;

  const now = new Date();
  const patch: Record<string, string | null> = {
    current_tz: loc.tz,
    current_label: loc.label,
    location_at: now.toISOString(),
  };

  // First detection establishes home, silently.
  if (!p?.home_tz) {
    patch.home_tz = loc.tz;
    patch.home_label = loc.label;
    patch.travel_status = "home";
    await supabase.from("profiles").update(patch).eq("user_id", user.id);
    return { ok: true, prompt: null };
  }

  const diffH = offsetDiffHours(p.home_tz, loc.tz, now);
  const meaningful = Math.abs(diffH) >= MIN_TRAVEL_OFFSET_H;
  const status = p.travel_status ?? "home";
  const promptFor = (): TravelPrompt => ({
    label: loc.label,
    hours: Math.round(Math.abs(diffH)),
    direction: diffH > 0 ? "east" : "west",
  });
  let prompt: TravelPrompt = null;

  if (!meaningful) {
    // Same offset as home (e.g. Madrid↔Paris) — not jet lag. If we'd drifted
    // into pending/traveling and have returned, reset.
    if (status !== "home") patch.travel_status = "home";
  } else if (status === "home") {
    patch.travel_status = "pending";
    prompt = promptFor();
  } else if (status === "pending") {
    prompt = promptFor();
  }
  // status === "traveling" with a meaningful offset: leave it; Today shows the
  // travel card.

  await supabase.from("profiles").update(patch).eq("user_id", user.id);
  if (patch.travel_status && patch.travel_status !== status) {
    revalidatePath("/today");
  }
  return { ok: true, prompt };
}

// User confirmed they're traveling → activate the adjustment window.
export async function confirmTravel(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("profiles")
    .update({
      travel_status: "traveling",
      travel_started_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) return { ok: false };

  revalidatePath("/today");
  return { ok: true };
}

// User said this isn't travel (relocation, VPN, or a bad IP guess) → adopt the
// current location as the new home and clear travel.
export async function dismissTravel(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("current_tz,current_label")
    .eq("user_id", user.id)
    .single();
  const c = profile as { current_tz: string | null; current_label: string | null } | null;

  const { error } = await supabase
    .from("profiles")
    .update({
      home_tz: c?.current_tz ?? null,
      home_label: c?.current_label ?? null,
      travel_status: "home",
      travel_started_at: null,
    })
    .eq("user_id", user.id);
  if (error) return { ok: false };

  revalidatePath("/today");
  return { ok: true };
}
