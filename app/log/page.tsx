import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus } from "lucide-react";
import { defaultMeal } from "@/lib/food";
import { LogForm } from "./log-form";
import { SavedMeals, type SavedMealItem } from "./saved-meals";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
        <h1 className="text-2xl font-semibold">Log food</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <SavedMeals items={saved} />

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          or type it
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LogForm defaultMeal={defaultMeal()} />
    </main>
  );
}
