import Anthropic from "@anthropic-ai/sdk";
import type { ParsedNutrition } from "./types";
import { cleanPlants } from "./plants";

// Pinned by the project spec.
export const NUTRITION_MODEL = "claude-opus-4-8";

const NUTRIENT_FIELDS =
  "calories: number, protein_g: number, carbs_g: number, fat_g: number, fiber_g: number, saturated_fat_g: number, trans_fat_g: number, cholesterol_mg: number, iron_mg: number, calcium_mg: number, magnesium_mg: number, vitamin_d_mcg: number, omega3_mg: number, plants: string[]";

const NUTRIENT_GUIDANCE =
  "Also estimate saturated_fat_g, trans_fat_g (industrial/partially-hydrogenated trans fat in grams; ~0 for whole/unprocessed foods, higher for fried fast food, baked goods, margarine), cholesterol_mg (milligrams), and the micronutrients iron_mg, calcium_mg, magnesium_mg, vitamin_d_mcg (micrograms), omega3_mg (milligrams) from USDA averages; use 0 when a nutrient is genuinely absent. `plants` is the list of DISTINCT whole-plant foods eaten in a MEANINGFUL amount — a real serving or substantial ingredient, NOT a trace, garnish, or seasoning. Include each fruit, vegetable, legume, nut, seed, or whole grain once (lowercase singular, e.g. [\"spinach\",\"chickpea\",\"walnut\"]). EXCLUDE herbs, spices, and flavourings/beverages used in small amounts — e.g. coffee, espresso, cocoa, chocolate, vanilla, tea, matcha, and seasonings like pepper, cinnamon, or salt. Empty array if none. ";

// Every component carries its OWN full nutrient breakdown so the app can show
// which specific food in a multi-item log contributed each nutrient. The
// top-level totals must equal the sum of the items.
const ITEM_FIELDS =
  "name, quantity, grams, calories, protein_g, carbs_g, fat_g, fiber_g, saturated_fat_g, trans_fat_g, cholesterol_mg, iron_mg, calcium_mg, magnesium_mg, vitamin_d_mcg, omega3_mg";

export const TEXT_SYSTEM_PROMPT =
  `You are a nutrition database. Given a free-text meal description, return JSON only with shape {${NUTRIENT_FIELDS}, serving_size: string, items: [{${ITEM_FIELDS}}], assumptions: string[]}. Break the meal into its individual component foods — one entry in \`items\` per distinct food — and give EACH component its own full nutrient estimate (the same fields as the totals). The top-level totals must equal the sum of the items. Estimate using USDA averages. \`grams\` is the estimated total edible weight of that item in grams. ` +
  NUTRIENT_GUIDANCE +
  "Use widely-accepted STANDARD serving sizes for well-known items unless the user specifies a quantity (e.g. a single espresso shot is 30 ml, so a double espresso is 60 ml; a standard glass of wine is 150 ml; a pint of beer is 473 ml; a slice of sandwich bread is ~30 g). Prefer these canonical references over guessing. " +
  "You may be given the user's PREVIOUS logs for similar foods. Stay consistent with how this user logs things; entries marked [user-corrected] are the user's own corrections and must be treated as authoritative for their portions and macros. " +
  "If quantity is still ambiguous assume one typical serving and note it in assumptions. Always return valid JSON, no prose.";

// Vision uses the same schema as text plus a confidence field (0..1)
// because photo identification is fuzzier than text.
export const VISION_SYSTEM_PROMPT =
  `You are a nutrition database. Given a meal photo, return JSON only with shape {${NUTRIENT_FIELDS}, serving_size: string, items: [{${ITEM_FIELDS}}], assumptions: string[], confidence: number}. Break the meal into its individual component foods — one entry in \`items\` per distinct food — and give EACH component its own full nutrient estimate (the same fields as the totals). The top-level totals must equal the sum of the items. Estimate using USDA averages. \`grams\` is the estimated total edible weight of that item in grams. ` +
  NUTRIENT_GUIDANCE +
  "confidence is between 0 and 1 reflecting how clearly you can identify the meal and portion sizes from the image. If portion is ambiguous assume one typical serving and note it in assumptions. Always return valid JSON, no prose.";

export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

let client: Anthropic | null = null;

export function getAnthropic() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export type ParseResult =
  | { ok: true; data: ParsedNutrition; raw: unknown }
  | { ok: false; error: string; raw: unknown };

// Pull the first text block out of a Messages response.
function firstText(content: Anthropic.Messages.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

// All text blocks joined — used for the web-search path, where the model may
// emit narration around its tool use and the JSON lands in a later text block.
function allText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// Pull a JSON object out of model text: strips ```json fences, and if the text
// has surrounding prose (e.g. after a web search) returns the first balanced
// {...} object so JSON.parse succeeds.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : trimmed).trim();
  if (body.startsWith("{")) return body;
  const start = body.indexOf("{");
  if (start === -1) return body;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  return body.slice(start);
}

function coerceNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

// Normalize the parsed object into our ParsedNutrition shape without
// inventing any numbers — missing/invalid values become null.
function normalize(obj: Record<string, unknown>): ParsedNutrition {
  const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
  const items = itemsRaw.map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    const optNum = (v: unknown) => coerceNumberOrNull(v) ?? undefined;
    return {
      name: typeof i.name === "string" ? i.name : "",
      quantity: typeof i.quantity === "string" ? i.quantity : "",
      grams: optNum(i.grams),
      calories: coerceNumberOrNull(i.calories) ?? 0,
      protein_g: coerceNumberOrNull(i.protein_g) ?? 0,
      carbs_g: coerceNumberOrNull(i.carbs_g) ?? 0,
      fat_g: coerceNumberOrNull(i.fat_g) ?? 0,
      fiber_g: optNum(i.fiber_g),
      saturated_fat_g: optNum(i.saturated_fat_g),
      trans_fat_g: optNum(i.trans_fat_g),
      cholesterol_mg: optNum(i.cholesterol_mg),
      iron_mg: optNum(i.iron_mg),
      calcium_mg: optNum(i.calcium_mg),
      magnesium_mg: optNum(i.magnesium_mg),
      vitamin_d_mcg: optNum(i.vitamin_d_mcg),
      omega3_mg: optNum(i.omega3_mg),
    };
  });

  const plants = Array.isArray(obj.plants)
    ? cleanPlants(obj.plants as unknown[] as string[])
    : [];

  return {
    calories: coerceNumberOrNull(obj.calories) ?? 0,
    protein_g: coerceNumberOrNull(obj.protein_g) ?? 0,
    carbs_g: coerceNumberOrNull(obj.carbs_g) ?? 0,
    fat_g: coerceNumberOrNull(obj.fat_g) ?? 0,
    fiber_g: coerceNumberOrNull(obj.fiber_g) ?? 0,
    saturated_fat_g: coerceNumberOrNull(obj.saturated_fat_g) ?? 0,
    trans_fat_g: coerceNumberOrNull(obj.trans_fat_g) ?? 0,
    cholesterol_mg: coerceNumberOrNull(obj.cholesterol_mg) ?? 0,
    iron_mg: coerceNumberOrNull(obj.iron_mg) ?? 0,
    calcium_mg: coerceNumberOrNull(obj.calcium_mg) ?? 0,
    magnesium_mg: coerceNumberOrNull(obj.magnesium_mg) ?? 0,
    vitamin_d_mcg: coerceNumberOrNull(obj.vitamin_d_mcg) ?? 0,
    omega3_mg: coerceNumberOrNull(obj.omega3_mg) ?? 0,
    plants,
    serving_size:
      typeof obj.serving_size === "string" ? obj.serving_size : "",
    items,
    assumptions: Array.isArray(obj.assumptions)
      ? obj.assumptions.filter((a): a is string => typeof a === "string")
      : [],
    confidence: coerceNumberOrNull(obj.confidence) ?? undefined,
  };
}

type UserContent = string | Anthropic.Messages.ContentBlockParam[];

async function callAndParse(
  userContent: UserContent,
  systemPrompt: string = TEXT_SYSTEM_PROMPT,
  opts: { webSearch?: boolean } = {},
): Promise<ParseResult> {
  let raw: unknown = null;
  try {
    // Web search (server tool, runs inside the one call) makes the request take
    // longer, so give it a wider timeout than the plain 30s parse.
    const tools = opts.webSearch
      ? ([{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] as
          Anthropic.Messages.ToolUnion[])
      : undefined;
    const resp = await getAnthropic().messages.create(
      {
        model: NUTRITION_MODEL,
        // Generous so multi-item meals, now that every component carries its own
        // full nutrient breakdown, never truncate mid-JSON.
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        ...(tools ? { tools } : {}),
      },
      { timeout: opts.webSearch ? 60_000 : 30_000 },
    );
    raw = resp;

    if (resp.stop_reason === "refusal") {
      return { ok: false, error: "The model declined to parse this entry.", raw };
    }

    const text = extractJson(
      opts.webSearch ? allText(resp.content) : firstText(resp.content),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: "The model did not return valid JSON.",
        raw,
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "Unexpected response shape.", raw };
    }

    return {
      ok: true,
      data: normalize(parsed as Record<string, unknown>),
      raw,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error calling Claude.";
    return { ok: false, error: message, raw };
  }
}

// Parse a free-text meal description. Never fabricates: on any failure
// returns ok:false so the caller can save nulls and surface an error.
//
// `history` is a short list of the user's previous logs for similar items,
// injected as reference so estimates stay consistent with how this user logs
// (and so their corrections stick).
export type MealHistoryItem = {
  description: string;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  edited_by_user: boolean;
};

function formatHistory(history: MealHistoryItem[]): string {
  const n = (v: number | null) => (v == null ? "?" : Math.round(v).toString());
  const lines = history.map((h) => {
    const serv = h.serving_size ? ` (${h.serving_size})` : "";
    const tag = h.edited_by_user ? " [user-corrected]" : "";
    return `- "${h.description}"${serv}: ${n(h.calories)} kcal, P ${n(h.protein_g)}, C ${n(h.carbs_g)}, F ${n(h.fat_g)}${tag}`;
  });
  return lines.join("\n");
}

// When the entry names a specific restaurant + dish, let the model look it up.
const RESTAURANT_REF = /\brestaurant\b|\bmenu item\b|\bmenu:|\bcafé\b|\bcafe\b|\bbrasserie\b|\bbistro\b/i;

const RESTAURANT_SEARCH_GUIDANCE =
  " The entry names a specific restaurant and/or menu item. Use web search to find that restaurant's menu and the dish's description/typical ingredients, and base your component breakdown on what you actually find rather than a generic guess. In `assumptions`, briefly note what the menu/search told you (e.g. the dish's listed components) and that it informed the estimate. Apply any portion notes the user gave (e.g. \"ate ~40%\"). Your FINAL output must still be ONLY the JSON object — no prose after it.";

export async function parseTextMeal(
  description: string,
  history: MealHistoryItem[] = [],
): Promise<ParseResult> {
  const userContent =
    history.length === 0
      ? description
      : `Meal to log: ${description}\n\n` +
        `This user's previous logs for similar items (match their portion conventions; [user-corrected] entries are authoritative):\n` +
        `${formatHistory(history)}`;

  // Restaurant + dish entries get a live web-search lookup to ground the
  // estimate in the real menu. If search is unavailable or fails, fall back to
  // the normal knowledge-based parse so logging never breaks.
  if (RESTAURANT_REF.test(description)) {
    const searched = await callAndParse(
      userContent,
      TEXT_SYSTEM_PROMPT + RESTAURANT_SEARCH_GUIDANCE,
      { webSearch: true },
    );
    if (searched.ok) return searched;
  }

  return callAndParse(userContent);
}

// Fallback when OpenFoodFacts has no record for a barcode. We tell Claude
// what was scanned and what the user thinks it is so it can estimate from
// nearest-match products. Same JSON contract as the text path.
export async function parseBarcodeFallback(args: {
  barcode: string;
  productGuess: string;
}): Promise<ParseResult> {
  const userMessage = `Barcode ${args.barcode} was scanned but not in the OpenFoodFacts database. The user describes the product as: ${args.productGuess}. Estimate nutrition for one typical serving.`;
  return callAndParse(userMessage);
}

// ─── Recipe parsing ─────────────────────────────────────────────────────

const RECIPE_SYSTEM_PROMPT =
  "You are a culinary nutrition assistant. Given a recipe (title, ingredient list, and optional preparation notes), return JSON only with shape {name: string, servings: number, serving_size: string, calories_per_serving: number, protein_g_per_serving: number, carbs_g_per_serving: number, fat_g_per_serving: number, fiber_g_per_serving: number, ingredients: [{name: string, quantity: string}], assumptions: string[]}. Estimate nutrition with USDA averages. If servings isn't stated, infer from total volume/weight + a typical portion (note the assumption). Always return valid JSON, no prose.";

export type ParsedRecipe = {
  name: string;
  servings: number;
  serving_size: string;
  calories_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  fiber_g_per_serving: number;
  ingredients: Array<{ name: string; quantity: string }>;
  assumptions: string[];
};

export type RecipeParseResult =
  | { ok: true; data: ParsedRecipe; raw: unknown }
  | { ok: false; error: string; raw: unknown };

function normalizeRecipe(obj: Record<string, unknown>): ParsedRecipe {
  const ingsRaw = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const ingredients = ingsRaw.map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    return {
      name: typeof i.name === "string" ? i.name : "",
      quantity: typeof i.quantity === "string" ? i.quantity : "",
    };
  });
  const num = (v: unknown, d = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  return {
    name: typeof obj.name === "string" ? obj.name : "Untitled recipe",
    servings: Math.max(1, num(obj.servings, 1)),
    serving_size:
      typeof obj.serving_size === "string" ? obj.serving_size : "",
    calories_per_serving: num(obj.calories_per_serving),
    protein_g_per_serving: num(obj.protein_g_per_serving),
    carbs_g_per_serving: num(obj.carbs_g_per_serving),
    fat_g_per_serving: num(obj.fat_g_per_serving),
    fiber_g_per_serving: num(obj.fiber_g_per_serving),
    ingredients,
    assumptions: Array.isArray(obj.assumptions)
      ? obj.assumptions.filter((a): a is string => typeof a === "string")
      : [],
  };
}

// Parse a recipe given the raw page text (we fetch the URL server-side
// and feed Claude the trimmed body). Never invents — null fields stay 0.
export async function parseRecipe(args: {
  url: string;
  body: string;
}): Promise<RecipeParseResult> {
  let raw: unknown = null;
  try {
    const userMessage = `Source URL: ${args.url}\n\nPage content (recipe body, may include site chrome):\n\n${args.body.slice(
      0,
      18_000,
    )}`;
    const resp = await getAnthropic().messages.create(
      {
        model: NUTRITION_MODEL,
        max_tokens: 2048,
        system: RECIPE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      },
      { timeout: 45_000 },
    );
    raw = resp;
    if (resp.stop_reason === "refusal") {
      return { ok: false, error: "Model declined to parse this recipe.", raw };
    }
    let text = "";
    for (const block of resp.content) if (block.type === "text") text += block.text;
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fence ? fence[1].trim() : trimmed;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { ok: false, error: "Recipe didn't come back as valid JSON.", raw };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "Unexpected recipe shape.", raw };
    }
    return {
      ok: true,
      data: normalizeRecipe(parsed as Record<string, unknown>),
      raw,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error parsing recipe.";
    return { ok: false, error: message, raw };
  }
}

// Parse a meal photo via vision. Schema includes confidence per spec.
export async function parsePhotoMeal(args: {
  imageBase64: string;
  mediaType: SupportedImageMediaType;
}): Promise<ParseResult> {
  const content: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: args.mediaType,
        data: args.imageBase64,
      },
    },
    {
      type: "text",
      text: "Analyze this meal photo and return only JSON matching the schema in your instructions.",
    },
  ];
  return callAndParse(content, VISION_SYSTEM_PROMPT);
}

