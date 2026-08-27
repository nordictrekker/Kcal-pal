"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  locationFromHeaders,
  offsetDiffHours,
  haversineKm,
  MIN_TRAVEL_OFFSET_H,
  MIN_TRAVEL_DISTANCE_KM,
} from "@/lib/travel";
import { searchCities, type CityResult } from "@/lib/geocode";
import { logQueryError } from "@/lib/log";

export type TravelPrompt = {
  label: string;
  kind: "jetlag" | "longhaul";
  hours: number;
  direction: "east" | "west";
  distanceKm: number;
} | null;

type LocProfile = {
  home_tz: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_status: string | null;
  location_dismissed_label: string | null;
};

// Detect physical location from IP geolocation, compare to home, and advance
// the travel state machine. Never activates travel on its own — at most it
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

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("home_tz,home_lat,home_lng,travel_status,location_dismissed_label")
    .eq("user_id", user.id)
    .single();
  // Without the profile we'd read a missing home base as "first detection" and
  // overwrite it with wherever this request came from.
  if (profileErr) {
    logQueryError("location.syncLocation.profile", profileErr);
    return { ok: false, prompt: null };
  }
  const p = profile as LocProfile | null;

  const now = new Date();
  const patch: Record<string, string | number | null> = {
    current_tz: loc.tz,
    current_label: loc.label,
    current_lat: loc.lat,
    current_lng: loc.lng,
    location_at: now.toISOString(),
  };

  // First detection establishes home, silently.
  if (!p?.home_tz) {
    patch.home_tz = loc.tz;
    patch.home_label = loc.label;
    patch.home_lat = loc.lat;
    patch.home_lng = loc.lng;
    patch.travel_status = "home";
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("user_id", user.id);
    if (error) {
      logQueryError("location.syncLocation.setHome", error);
      return { ok: false, prompt: null };
    }
    return { ok: true, prompt: null };
  }

  const diffH = offsetDiffHours(p.home_tz, loc.tz, now);
  const distanceKm = haversineKm(
    { lat: p.home_lat, lng: p.home_lng },
    { lat: loc.lat, lng: loc.lng },
  );
  const isJetlag = Math.abs(diffH) >= MIN_TRAVEL_OFFSET_H;
  const isLonghaul = distanceKm >= MIN_TRAVEL_DISTANCE_KM;
  // A reading the user explicitly rejected as wrong (bad IP/VPN) is suppressed
  // until a genuinely different location shows up (which clears the marker).
  if (p.location_dismissed_label && loc.label !== p.location_dismissed_label) {
    patch.location_dismissed_label = null;
  }
  const dismissed = loc.label === p.location_dismissed_label;
  const meaningful = (isJetlag || isLonghaul) && !dismissed;
  const status = p.travel_status ?? "home";
  const promptFor = (): TravelPrompt => ({
    label: loc.label,
    kind: isJetlag ? "jetlag" : "longhaul",
    hours: Math.round(Math.abs(diffH)),
    direction: diffH > 0 ? "east" : "west",
    distanceKm,
  });
  let prompt: TravelPrompt = null;

  if (!meaningful) {
    if (status !== "home") patch.travel_status = "home";
  } else if (status === "home") {
    patch.travel_status = "pending";
    prompt = promptFor();
  } else if (status === "pending") {
    prompt = promptFor();
  }
  // status === "traveling" → leave it; Today shows the card.

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);
  if (error) {
    logQueryError("location.syncLocation.update", error);
    return { ok: false, prompt: null };
  }
  if (patch.travel_status && patch.travel_status !== status) {
    revalidatePath("/today");
  }
  return { ok: true, prompt };
}

async function setStatus(
  patch: Record<string, string | number | boolean | null>,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);
  if (error) {
    logQueryError("location.setStatus", error, { fields: Object.keys(patch) });
    return { ok: false };
  }
  revalidatePath("/today");
  revalidatePath("/settings");
  return { ok: true };
}

// Confirm a detected trip (or start one manually from Settings).
export async function confirmTravel(): Promise<{ ok: boolean }> {
  return setStatus({
    travel_status: "traveling",
    travel_started_at: new Date().toISOString(),
  });
}

// Start a trip manually even if IP detection didn't catch it.
export async function startManualTravel(): Promise<{ ok: boolean }> {
  return setStatus({
    travel_status: "traveling",
    travel_manual: true,
    travel_started_at: new Date().toISOString(),
  });
}

// Set the current detected location as the home base (signed up abroad, or
// settling somewhere new) and clear any travel state. Same effect as
// dismissTravel, named for the Settings control.
export async function setHomeToCurrent(): Promise<{ ok: boolean }> {
  return dismissTravel();
}

// Typeahead for the home-base city search (onboarding + Settings).
export async function searchHomeCities(query: string): Promise<CityResult[]> {
  return searchCities(query);
}

// Set home base to a searched city and clear travel.
export async function setHomeBaseCity(
  city: CityResult,
): Promise<{ ok: boolean }> {
  return setStatus({
    home_tz: city.tz,
    home_label: city.label,
    home_lat: city.lat,
    home_lng: city.lng,
    travel_status: "home",
    travel_manual: false,
    travel_started_at: null,
  });
}

// "I'm back home": clear travel without changing the stored home location.
export async function endTravel(): Promise<{ ok: boolean }> {
  return setStatus({
    travel_status: "home",
    travel_manual: false,
    travel_started_at: null,
  });
}

// "That's wrong" — the detected location is a bad IP/VPN reading. Keep the
// existing home untouched, clear the pending travel state, and remember the
// rejected label so the same wrong reading doesn't immediately re-prompt.
export async function rejectLocation(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("current_label")
    .eq("user_id", user.id)
    .single();
  if (profileErr) {
    logQueryError("location.rejectLocation.profile", profileErr);
    return { ok: false };
  }
  const label = (profile as { current_label: string | null } | null)?.current_label ?? null;

  return setStatus({
    travel_status: "home",
    travel_manual: false,
    travel_started_at: null,
    location_dismissed_label: label,
  });
}

// "No, this isn't travel — I live here": adopt current location as the new
// home (relocation, VPN, or a bad IP guess) and clear travel.
export async function dismissTravel(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("current_tz,current_label,current_lat,current_lng")
    .eq("user_id", user.id)
    .single();
  // Adopting a null current location would wipe the stored home base.
  if (profileErr) {
    logQueryError("location.dismissTravel.profile", profileErr);
    return { ok: false };
  }
  const c = profile as {
    current_tz: string | null;
    current_label: string | null;
    current_lat: number | null;
    current_lng: number | null;
  } | null;

  return setStatus({
    home_tz: c?.current_tz ?? null,
    home_label: c?.current_label ?? null,
    home_lat: c?.current_lat ?? null,
    home_lng: c?.current_lng ?? null,
    travel_status: "home",
    travel_manual: false,
    travel_started_at: null,
  });
}
