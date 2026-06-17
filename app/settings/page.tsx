import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { InstallCard } from "./install-card";
import { Notifications } from "./notifications";
import { ThemeToggle } from "./theme-toggle";
import { ShortcutCard } from "./shortcut-card";
import { TargetsCard, type Targets } from "./targets-card";
import { MetricsCard } from "./metrics-card";
import { sanitizeMetricKeys } from "@/lib/nutrients";
import { TravelCard, type TravelState } from "./travel-card";
import { ProfileCard, type ProfileSettings } from "./profile-card";
import { PhaseModifiersCard } from "./phase-card";
import { normalizeModifiers } from "@/lib/phase-modifiers";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const ingestToken = process.env.HEALTH_INGEST_TOKEN ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const p = profile as Profile | null;
  const targets: Targets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
    water_oz: Math.round((p?.daily_water_target_ml ?? 2400) / 29.5735),
    water_mode: (p?.water_goal_mode ?? "auto") as "auto" | "manual",
  };
  const travelState: TravelState = {
    status: (p?.travel_status ?? "home") as TravelState["status"],
    homeLabel: p?.home_label ?? null,
    currentLabel: p?.current_label ?? null,
    startedAt: p?.travel_started_at ?? null,
  };
  const phaseModifiers = normalizeModifiers(p?.phase_modifiers);
  const profileSettings: ProfileSettings = {
    first_name: p?.first_name ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    sex: p?.sex ?? "female",
    height_in: p?.height_in ?? null,
    activity_level: p?.activity_level ?? "moderate",
    goal: p?.goal ?? "maintain",
    goal_weight_lbs: p?.goal_weight_lbs ?? null,
    target_mode: p?.target_mode ?? "manual",
    track_cycle: p?.track_cycle ?? true,
    last_period_start: p?.last_period_start ?? "",
    avg_cycle_length: p?.avg_cycle_length ?? 28,
    avg_period_length: p?.avg_period_length ?? 5,
  };

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const ingestUrl = host
    ? `${proto}://${host}/api/health/ingest`
    : "/api/health/ingest";

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <ProfileCard initial={profileSettings} />

      <TargetsCard targets={targets} />

      <MetricsCard initial={sanitizeMetricKeys(p?.visible_metrics)} />

      <TravelCard state={travelState} />

      <PhaseModifiersCard initial={phaseModifiers} />

      <ThemeToggle />

      <InstallCard />

      {vapidPublicKey ? (
        <Notifications vapidPublicKey={vapidPublicKey} />
      ) : (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Push notifications aren&apos;t configured (VAPID keys missing on the
          server).
        </p>
      )}

      {ingestToken ? (
        <ShortcutCard ingestUrl={ingestUrl} token={ingestToken} />
      ) : null}

      <p className="px-1 text-xs text-muted-foreground">
        Signed in as {user.email}.
      </p>
    </main>
  );
}
