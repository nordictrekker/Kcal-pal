import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dayBounds, sumTotals } from "@/lib/food";
import { describeDrink } from "@/lib/alcohol";
import type { FoodEntry, Profile } from "@/lib/types";
import { MacroTotals } from "../macro-totals";
import { EntryList } from "../entry-list";

export const dynamic = "force-dynamic";

// Full food log for today: tap any entry to expand its component macros.
export default async function SummaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { start, end } = dayBounds();

  const [{ data: profile }, { data: rows }, { data: drinkRows }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("consumed_at", start)
        .lt("consumed_at", end)
        .order("consumed_at", { ascending: true }),
      supabase
        .from("alcohol_logs")
        .select("id,drink_type,volume_ml,calories,standard_drinks,logged_at")
        .eq("user_id", user.id)
        .gte("logged_at", start)
        .lt("logged_at", end)
        .order("logged_at", { ascending: true }),
    ]);

  const p = profile as Profile | null;
  const entries = (rows ?? []) as FoodEntry[];
  const drinks = (drinkRows ?? []) as Array<{
    id: string;
    drink_type: string;
    volume_ml: number;
    calories: number;
    standard_drinks: number;
  }>;
  const alcoholCalories = Math.round(
    drinks.reduce((s, d) => s + Number(d.calories), 0),
  );
  const foodTotals = sumTotals(entries);
  const totals = {
    ...foodTotals,
    calories: foodTotals.calories + alcoholCalories,
  };

  // Stored targets — same numbers the home card shows.
  const targets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
  };

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <Link
          href="/today"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" /> Today
        </Link>
        <h1 className="font-serif text-3xl font-medium leading-tight">
          Today&apos;s log
        </h1>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
      </header>

      <MacroTotals totals={totals} targets={targets} />

      <p className="text-xs text-muted-foreground">
        Tap an entry to see what each part contributed.
      </p>

      <EntryList entries={entries} />

      {drinks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Alcohol · {alcoholCalories} kcal
          </h2>
          <div className="divide-y rounded-lg border">
            {drinks.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {describeDrink(d.drink_type, Number(d.volume_ml))}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(Number(d.calories))} kcal ·{" "}
                  {(Math.round(Number(d.standard_drinks) * 10) / 10).toFixed(1)}{" "}
                  drinks
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        href="/log"
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log food
      </Link>
    </main>
  );
}
