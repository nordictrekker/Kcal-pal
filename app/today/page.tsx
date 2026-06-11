import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { dayBounds, sumTotals } from "@/lib/food";
import type { FoodEntry, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MacroTotals } from "./macro-totals";
import { EntryList } from "./entry-list";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { start, end } = dayBounds();

  const [{ data: profile }, { data: entries }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("consumed_at", start)
      .lt("consumed_at", end)
      .order("consumed_at", { ascending: true }),
  ]);

  const list = (entries ?? []) as FoodEntry[];
  const totals = sumTotals(list);
  const p = profile as Profile | null;

  const targets = {
    calories: p?.daily_calorie_target ?? 2000,
    protein_g: p?.daily_protein_target_g ?? 130,
    carbs_g: p?.daily_carb_target_g ?? 220,
    fat_g: p?.daily_fat_target_g ?? 70,
    fiber_g: p?.daily_fiber_target_g ?? 30,
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-6 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      <MacroTotals totals={totals} targets={targets} />

      <EntryList entries={list} />

      <Link
        href="/log"
        className="fixed inset-x-0 bottom-4 mx-auto flex h-12 w-[calc(100%-2rem)] max-w-md items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-lg"
      >
        + Log food
      </Link>
    </main>
  );
}
