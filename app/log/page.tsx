import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus, BookOpen } from "lucide-react";
import { defaultMeal } from "@/lib/food";
import { detectFrequentItems, type PantryComponent } from "@/lib/pantry";
import { extractComponents } from "@/lib/food-items";
import { LogComposer } from "./log-composer";
import type { SavedMealItem } from "./saved-meals";
import type { Meal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { date } = await searchParams;
  const todayKey = new Date().toISOString().slice(0, 10);
  const logDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayKey ? date : null;
  const logDateLabel = logDate
    ? new Date(`${logDate}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : null;

  // Saved meals and the pantry source (recent logs) are independent — fetch in
  // parallel rather than one after the other.
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const [{ data: savedRaw }, { data: recentRaw }] = await Promise.all([
    supabase
      .from("saved_meals")
      .select("id,label,description,calories,protein_g,last_used_at,use_count")
      .eq("user_id", user.id)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("use_count", { ascending: false })
      .limit(20),
    // Auto-detected pantry: the user's most-eaten component foods over the last
    // ~45 days, surfaced as quick-fill chips (no manual saving required). Logs
    // are broken into their AI component breakdown, then clustered by food token
    // so a daily yogurt or latte surfaces even when worded differently each time.
    supabase
      .from("food_entries")
      .select("meal,consumed_at,raw_ai_response")
      .eq("user_id", user.id)
      .gte("consumed_at", since)
      .order("consumed_at", { ascending: false })
      .limit(200),
  ]);
  const saved: SavedMealItem[] = (savedRaw ?? []).map((s) => ({
    id: s.id as string,
    label: s.label as string,
    description: s.description as string,
    calories: s.calories as number | null,
    protein_g: s.protein_g as number | null,
  }));
  const components: PantryComponent[] = (recentRaw ?? []).flatMap((r) =>
    extractComponents(r.raw_ai_response).map((c) => ({
      name: c.name,
      quantity: c.quantity,
      meal: r.meal as Meal | null,
      consumedAt: r.consumed_at as string,
      nutrients: {
        calories: c.calories,
        protein_g: c.protein_g,
        carbs_g: c.carbs_g,
        fat_g: c.fat_g,
        fiber_g: c.fiber_g,
        saturated_fat_g: c.saturated_fat_g,
        cholesterol_mg: c.cholesterol_mg,
        iron_mg: c.iron_mg,
        calcium_mg: c.calcium_mg,
        magnesium_mg: c.magnesium_mg,
        vitamin_d_mcg: c.vitamin_d_mcg,
        omega3_mg: c.omega3_mg,
      },
    })),
  );
  // Only surface a food in the pantry once it's been logged at least 3 times in
  // the ~45-day window — enough to be a genuine staple, not a one-off.
  const frequentItems = detectFrequentItems(components, { minCount: 3 });

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {logDate ? "Add to a past day" : "Log food"}
        </h1>
        <Link
          href={logDate ? `/today/summary?date=${logDate}` : "/today"}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {logDate ? "Back →" : "Today →"}
        </Link>
      </header>

      {logDateLabel ? (
        <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Logging to <span className="font-medium text-foreground">{logDateLabel}</span>.
          Typed entries only — scan/photo always log to today.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/log/scan"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          <Camera className="size-4" />
          Scan
        </Link>
        <Link
          href="/log/photo"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          <ImagePlus className="size-4" />
          Photo
        </Link>
        <Link
          href="/recipes"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          <BookOpen className="size-4" />
          Recipes
        </Link>
      </div>

      <LogComposer
        frequentItems={frequentItems}
        savedItems={saved}
        defaultMeal={defaultMeal()}
        logDate={logDate}
      />
    </main>
  );
}
