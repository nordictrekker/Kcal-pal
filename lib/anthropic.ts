import Anthropic from "@anthropic-ai/sdk";
import type { ParsedNutrition } from "./types";

// Pinned by the project spec.
export const NUTRITION_MODEL = "claude-opus-4-8";

export const TEXT_SYSTEM_PROMPT =
  "You are a nutrition database. Given a free-text meal description, return JSON only with shape {calories: number, protein_g: number, carbs_g: number, fat_g: number, fiber_g: number, serving_size: string, items: [{name, quantity, calories, protein_g, carbs_g, fat_g}], assumptions: string[]}. Estimate using USDA averages. If quantity is ambiguous assume one typical serving. Always return valid JSON, no prose.";

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

// Parse a free-text meal description. Never fabricates: on any failure
// returns ok:false so the caller can save nulls and surface an error.
export async function parseTextMeal(description: string): Promise<ParseResult> {
  let raw: unknown = null;
  try {
    const resp = await getAnthropic().messages.create({
      model: NUTRITION_MODEL,
      max_tokens: 1024,
      system: TEXT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: description }],
    });
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
