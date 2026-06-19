// Food insights: an Opus-written, two-paragraph note about the last 7 days of
// eating — which foods did the most nutritional good, and which concrete foods
// would lift the macros/micros that are lagging. User-triggered and cached per
// ISO week (food_insights), mirroring the weekly digest.

import { getAnthropic, NUTRITION_MODEL } from "./anthropic";

export type InsightFood = { name: string; perDay: number };

export type InsightNutrient = {
  label: string;
  unit: string;
  avgPerDay: number;
  goal: number;
  pctOfGoal: number; // 0..1+ (avg / goal)
  lagging: boolean; // a "want to hit" nutrient sitting clearly under goal
  topFoods: InsightFood[]; // biggest contributors this week, per-day amounts
};

export type FoodInsightInput = {
  daysLogged: number;
  nutrients: InsightNutrient[];
};

const SYSTEM_PROMPT = [
  "You are the food-insights writer for a personal nutrition app used by a woman tracking her diet.",
  "You are given her last 7 days of eating: for each nutrient, the daily-average intake vs her goal, and the foods that contributed the most.",
  "Write exactly two short paragraphs of plain text — no headings, no bullet lists, no emoji, no markdown.",
  "Paragraph 1 (Standouts): name 2–4 specific foods from her logs that did the most nutritional good this week and what they delivered (protein, fiber, iron, omega-3, etc.). Draw only from the top-contributor foods given.",
  "Paragraph 2 (Lift): for the nutrients flagged as lagging, suggest specific, realistic foods that would raise them — ideally similar to what she already eats — with rough, honest amounts (e.g. 'a palmful of pumpkin seeds adds ~150 mg magnesium'). If nothing is lagging, briefly affirm the week is well-covered and name one easy way to keep it varied.",
  "Rules:",
  "- Reference her actual logged foods and the numbers given; never invent what she ate.",
  "- For the 'lift' suggestions you MAY recommend common foods she didn't log, with approximate amounts.",
  "- Warm, observant, specific, never preachy. 110–180 words total.",
  "- If little was logged (few days), say so honestly in one sentence and keep it brief.",
  "Return only the two paragraphs.",
].join("\n");

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function buildUserMessage(input: FoodInsightInput): string {
  const lines: string[] = [];
  lines.push(
    `Last 7 days — ${input.daysLogged} of 7 days had food logged. Daily averages vs goals:`,
  );
  lines.push("");
  for (const n of input.nutrients) {
    const pct = Math.round(n.pctOfGoal * 100);
    const flag = n.lagging ? "  [LAGGING]" : "";
    lines.push(
      `${n.label}: ${fmt(n.avgPerDay)}/${fmt(n.goal)} ${n.unit}/day (${pct}% of goal)${flag}`,
    );
    if (n.topFoods.length > 0) {
      const foods = n.topFoods
        .map((f) => `${f.name} (~${fmt(f.perDay)} ${n.unit}/day)`)
        .join(", ");
      lines.push(`  top foods: ${foods}`);
    } else {
      lines.push("  top foods: none logged");
    }
  }
  lines.push("");
  lines.push("Write the two paragraphs now.");
  return lines.join("\n");
}

export async function generateFoodInsights(
  input: FoodInsightInput,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  try {
    const resp = await getAnthropic().messages.create(
      {
        model: NUTRITION_MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      },
      { timeout: 30_000 },
    );

    if (resp.stop_reason === "refusal") {
      return { ok: false, error: "Model declined to write the insights." };
    }

    let text = "";
    for (const block of resp.content) {
      if (block.type === "text") text += block.text;
    }
    text = text.trim();
    if (!text) return { ok: false, error: "Empty response from model." };
    return { ok: true, summary: text };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}
