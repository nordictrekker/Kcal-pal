"use server";

import { requireUser, revalidatePaths, type ActionResult } from "@/lib/actions";
import { parseNumber, type NumberRange } from "@/lib/form-values";
import {
  isActivityLevel,
  isBodyBuild,
  isCalendarDate,
  isGoal,
  isSex,
  isTargetMode,
} from "@/lib/profile";

export type ProfileResult = ActionResult;

// Numeric fields and the range each accepts, with the message shown when the
// posted value falls outside it.
const NUMERIC_FIELDS: Array<[string, NumberRange, string]> = [
  ["height_in", { min: 36, max: 90 }, "Height out of range."],
  ["protein_per_kg", { min: 1, max: 3 }, "Protein per kg must be 1.0–3.0."],
  [
    "goal_weight_lbs",
    { min: 50, max: 600 },
    "Goal weight must be between 50 and 600 lb.",
  ],
  [
    "avg_cycle_length",
    { min: 21, max: 45, integer: true },
    "Cycle length must be 21–45 days.",
  ],
  [
    "avg_period_length",
    { min: 2, max: 10, integer: true },
    "Period length must be 2–10 days.",
  ],
];

// Enumerated fields, validated against the shared profile field lists.
const ENUM_FIELDS: Array<[string, (v: string) => boolean, string]> = [
  ["sex", isSex, "Invalid sex."],
  ["activity_level", isActivityLevel, "Invalid activity level."],
  ["goal", isGoal, "Invalid goal."],
  ["target_mode", isTargetMode, "Invalid target mode."],
];

// Update the body + goal + cycle fields that drive smarter targets and
// cycle automation. All fields optional — only present keys are written.
export async function updateProfileSettings(
  formData: FormData,
): Promise<ProfileResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const patch: Record<string, unknown> = {};

  const firstName = String(formData.get("first_name") ?? "").trim();
  if (firstName) patch.first_name = firstName;

  for (const [name, check, message] of ENUM_FIELDS) {
    const value = String(formData.get(name) ?? "").trim();
    if (!value) continue;
    if (!check(value)) return { ok: false, error: message };
    patch[name] = value;
  }

  for (const [name, range, message] of NUMERIC_FIELDS) {
    const parsed = parseNumber(formData.get(name), range);
    if (!parsed.ok) {
      if (parsed.empty) continue;
      return { ok: false, error: message };
    }
    patch[name] = parsed.value;
  }

  for (const [name, message] of [
    ["date_of_birth", "Invalid birth date."],
    ["last_period_start", "Invalid period start date."],
  ] as const) {
    const value = String(formData.get(name) ?? "").trim();
    if (!value) continue;
    if (!isCalendarDate(value)) return { ok: false, error: message };
    patch[name] = value;
  }

  // Cycle settings.
  const trackCycle = formData.get("track_cycle");
  if (trackCycle !== null)
    patch.track_cycle = trackCycle === "on" || trackCycle === "true";
  const bodyBuild = formData.get("body_build");
  if (bodyBuild !== null) {
    const v = String(bodyBuild);
    patch.body_build = isBodyBuild(v) ? v : null;
  }

  // Male profiles never track a cycle — enforce server-side so every consumer
  // (today, summary, recap, insights) sees cycle features off.
  if (patch.sex === "male") {
    patch.track_cycle = false;
    patch.last_period_start = null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePaths("/today", "/settings");
  return { ok: true };
}
