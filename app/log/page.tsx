import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus, BookOpen } from "lucide-react";
import { defaultMeal } from "@/lib/food";
import { LogForm } from "./log-form";
import { SavedMeals, type SavedMealItem } from "./saved-meals";

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

  const { data: savedRaw } = await supabase
    .from("saved_meals")
    .select("id,label,description,calories,protein_g,last_used_at,use_count")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("use_count", { ascending: false })
    .limit(20);
  const saved: SavedMealItem[] = (savedRaw ?? []).map((s) => ({
    id: s.id as string,
    label: s.label as string,
    description: s.description as string,
    calories: s.calories as number | null,
    protein_g: s.protein_g as number | null,
  }));

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

      <SavedMeals items={saved} />

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

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          or type it
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LogForm defaultMeal={defaultMeal()} logDate={logDate} />
    </main>
  );
}
