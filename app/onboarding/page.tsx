import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/lib/types";
import { OnboardingWizard, type WizardPrefill } from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: weights }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("body_weights")
      .select("weight_lbs")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1),
  ]);

  const p = profile as Profile | null;

  // Already onboarded → straight to Today.
  if (p?.onboarding_completed) redirect("/today");

  const sex = (p?.sex === "male" || p?.sex === "other" ? p.sex : "female") as
    | "female"
    | "male"
    | "other";
  const goal = (
    p?.goal === "lose" || p?.goal === "gain" ? p.goal : "maintain"
  ) as "lose" | "maintain" | "gain";

  const prefill: WizardPrefill = {
    first_name: p?.first_name ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    sex,
    height_in: p?.height_in ?? null,
    weight_lbs: weights?.[0]?.weight_lbs
      ? Number(weights[0].weight_lbs)
      : null,
    activity_level: p?.activity_level ?? "moderate",
    goal,
    target_mode: p?.target_mode === "manual" ? "manual" : "auto",
    track_cycle: p?.track_cycle ?? true,
    last_period_start: p?.last_period_start ?? null,
    avg_cycle_length: p?.avg_cycle_length ?? 28,
    avg_period_length: p?.avg_period_length ?? 5,
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <OnboardingWizard prefill={prefill} />
    </main>
  );
}
