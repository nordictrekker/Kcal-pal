// The enumerated profile fields, in one place, so onboarding and settings can
// never disagree about what the DB will accept.

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;
export const GOALS = ["lose", "maintain", "gain", "muscle"] as const;
export const SEXES = ["female", "male", "other"] as const;
export const BODY_BUILDS = ["lean", "average", "muscular", "higher_fat"] as const;
export const TARGET_MODES = ["auto", "manual"] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type Goal = (typeof GOALS)[number];
export type Sex = (typeof SEXES)[number];
export type BodyBuild = (typeof BODY_BUILDS)[number];
export type TargetMode = (typeof TARGET_MODES)[number];

const isOneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (allowed as readonly string[]).includes(v);

export const isActivityLevel = isOneOf(ACTIVITY_LEVELS);
export const isGoal = isOneOf(GOALS);
export const isSex = isOneOf(SEXES);
export const isBodyBuild = isOneOf(BODY_BUILDS);
export const isTargetMode = isOneOf(TARGET_MODES);

// A YYYY-MM-DD date the DB will accept (used for birth dates and cycle dates).
export function isCalendarDate(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(`${v}T00:00:00Z`));
}
