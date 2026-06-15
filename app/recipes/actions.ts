"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseRecipe } from "@/lib/anthropic";
import { defaultMeal, type Totals } from "@/lib/food";

export type RecipeResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string };

// Fetch a page server-side and strip the obvious chrome. Recipe sites
// vary wildly; we feed the full body (truncated) to Claude and let it
// sort out the ingredient list.
async function fetchPageBody(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      Accept: "text/html,application/xhtml+xml",
    },
    // 15s — recipe sites are heavy with ads but anything slower is a
    // bad citizen; fail visibly so the user can retry.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Couldn't load that page (HTTP ${res.status}).`);
  }
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Import a recipe from a URL. The Anthropic call is the slow part
// (~10s); the rest is fast.
export async function importRecipeFromUrl(
  formData: FormData,
): Promise<RecipeResult> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "Paste a recipe URL." };
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let body: string;
  try {
    body = await fetchPageBody(url);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't load the page.",
    };
  }
  if (body.length < 200) {
    return {
      ok: false,
      error: "Page returned almost no text — try a different URL.",
    };
  }

  const parse = await parseRecipe({ url, body });
  if (!parse.ok) return { ok: false, error: parse.error };

  const r = parse.data;
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      name: r.name,
      source_url: url,
      servings: r.servings,
      serving_size: r.serving_size,
      calories_per_serving: r.calories_per_serving,
      protein_g_per_serving: r.protein_g_per_serving,
      carbs_g_per_serving: r.carbs_g_per_serving,
      fat_g_per_serving: r.fat_g_per_serving,
      fiber_g_per_serving: r.fiber_g_per_serving,
      ingredients: r.ingredients,
      notes: r.assumptions.length ? r.assumptions.join(" · ") : null,
    })
    .select("id,name")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/recipes");
  return { ok: true, id: data.id as string, name: data.name as string };
}

// Log one serving (or N servings) of a recipe as a food entry. Bumps
// use_count + last_used_at for "recently used" ordering on the list.
export async function logRecipeServing(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("id") ?? "");
  const servingsRaw = String(formData.get("servings") ?? "1").trim();
  const servings = Number(servingsRaw);
  if (!id) return { ok: false, error: "Missing recipe id." };
  if (!Number.isFinite(servings) || servings <= 0 || servings > 20) {
    return { ok: false, error: "Servings must be 0–20." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: recipe, error: getErr } = await supabase
    .from("recipes")
    .select(
      "name,serving_size,calories_per_serving,protein_g_per_serving,carbs_g_per_serving,fat_g_per_serving,fiber_g_per_serving,use_count",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (getErr || !recipe) return { ok: false, error: "Recipe not found." };

  const scaled: Totals = {
    calories: Number(recipe.calories_per_serving ?? 0) * servings,
    protein_g: Number(recipe.protein_g_per_serving ?? 0) * servings,
    carbs_g: Number(recipe.carbs_g_per_serving ?? 0) * servings,
    fat_g: Number(recipe.fat_g_per_serving ?? 0) * servings,
    fiber_g: Number(recipe.fiber_g_per_serving ?? 0) * servings,
  };

  const { error: insErr } = await supabase.from("food_entries").insert({
    user_id: user.id,
    consumed_at: new Date().toISOString(),
    meal: defaultMeal(),
    description: `${recipe.name}${
      servings === 1 ? "" : ` × ${servings}`
    }`,
    source: "text",
    calories: scaled.calories,
    protein_g: scaled.protein_g,
    carbs_g: scaled.carbs_g,
    fat_g: scaled.fat_g,
    fiber_g: scaled.fiber_g,
    serving_size:
      servings === 1
        ? (recipe.serving_size as string | null)
        : `${servings} × ${recipe.serving_size ?? "serving"}`,
    edited_by_user: false,
  });
  if (insErr) return { ok: false, error: insErr.message };

  await supabase
    .from("recipes")
    .update({
      use_count: ((recipe.use_count as number) ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/recipes");
  revalidatePath("/today");
  return { ok: true };
}

export async function deleteRecipe(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing recipe id." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recipes");
  return { ok: true };
}
