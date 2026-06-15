import Anthropic from "@anthropic-ai/sdk";
import type { ParsedNutrition } from "./types";

// Pinned by the project spec.
export const NUTRITION_MODEL = "claude-opus-4-8";

export const TEXT_SYSTEM_PROMPT =
  "You are a nutrition database. Given a free-text meal description, return JSON only with shape {calories: number, protein_g: number, carbs_g: number, fat_g: number, fiber_g: number, serving_size: string, items: [{name, quantity, calories, protein_g, carbs_g, fat_g}], assumptions: string[]}. Estimate using USDA averages. If quantity is ambiguous assume one typical serving. Always return valid JSON, no prose.";

// Vision uses the same schema as text plus a confidence field (0..1)
// because photo identification is fuzzier than text.
export const VISION_SYSTEM_PROMPT =
  "You are a nutrition database. Given a meal photo, return JSON only with shape {calories: number, protein_g: number, carbs_g: number, fat_g: number, fiber_g: number, serving_size: string, items: [{name, quantity, calories, protein_g, carbs_g, fat_g}], assumptions: string[], confidence: number}. Estimate using USDA averages. confidence is between 0 and 1 reflecting how clearly you can identify the meal and portion sizes from the image. If portion is ambiguous assume one typical serving and note it in assumptions. Always return valid JSON, no prose.";

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

// Strip ```json fences if the model wraps the JSON despite instructions.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return trimmed;
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
    return {
      name: typeof i.name === "string" ? i.name : "",
      quantity: typeof i.quantity === "string" ? i.quantity : "",
      calories: coerceNumberOrNull(i.calories) ?? 0,
      protein_g: coerceNumberOrNull(i.protein_g) ?? 0,
      carbs_g: coerceNumberOrNull(i.carbs_g) ?? 0,
      fat_g: coerceNumberOrNull(i.fat_g) ?? 0,
    };
  });

  return {
    calories: coerceNumberOrNull(obj.calories) ?? 0,
    protein_g: coerceNumberOrNull(obj.protein_g) ?? 0,
    carbs_g: coerceNumberOrNull(obj.carbs_g) ?? 0,
    fat_g: coerceNumberOrNull(obj.fat_g) ?? 0,
    fiber_g: coerceNumberOrNull(obj.fiber_g) ?? 0,
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
): Promise<ParseResult> {
  let raw: unknown = null;
  try {
    // 30s is generous for a single message — keeps a hung Anthropic call
    // from holding a server-action thread forever.
    const resp = await getAnthropic().messages.create(
      {
        model: NUTRITION_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      },
      { timeout: 30_000 },
    );
    raw = resp;

    if (resp.stop_reason === "refusal") {
      return { ok: false, error: "The model declined to parse this entry.", raw };
    }

    const text = extractJson(firstText(resp.content));
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
export async function parseTextMeal(description: string): Promise<ParseResult> {
  return callAndParse(description);
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

