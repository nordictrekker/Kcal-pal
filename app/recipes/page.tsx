import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/actions";
import { ImportRecipeCard } from "./import-card";
import { RecipeList, type RecipeRow } from "./recipe-list";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { supabase, user } = await requireUserOrRedirect();

  const { data: rows } = await supabase
    .from("recipes")
    .select(
      "id,name,source_url,servings,serving_size,calories_per_serving,protein_g_per_serving,carbs_g_per_serving,fat_g_per_serving,fiber_g_per_serving,use_count,last_used_at,created_at",
    )
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("use_count", { ascending: false });

  const recipes: RecipeRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    source_url: r.source_url as string | null,
    servings: Number(r.servings ?? 1),
    serving_size: (r.serving_size as string | null) ?? null,
    calories_per_serving: Number(r.calories_per_serving ?? 0),
    protein_g_per_serving: Number(r.protein_g_per_serving ?? 0),
    carbs_g_per_serving: Number(r.carbs_g_per_serving ?? 0),
    fat_g_per_serving: Number(r.fat_g_per_serving ?? 0),
    fiber_g_per_serving: Number(r.fiber_g_per_serving ?? 0),
    use_count: Number(r.use_count ?? 0),
    last_used_at: (r.last_used_at as string | null) ?? null,
  }));

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Recipes</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <ImportRecipeCard />

      <RecipeList recipes={recipes} />
    </main>
  );
}
