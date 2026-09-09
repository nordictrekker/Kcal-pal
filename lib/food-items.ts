// Extract the per-component breakdown of a food entry from its stored AI
// response. raw_ai_response holds the full Anthropic message envelope
// ({ content: [{ type: "text", text: "<json>" }] }), so the items live inside
// that text as JSON — not at the top level. Handles a direct parsed object
// too, in case storage changes later.

export type ComponentItem = {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Per-component extended nutrients. Optional: older logs only itemized
  // macros, so these are absent there.
  fiber_g?: number;
  saturated_fat_g?: number;
  cholesterol_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  magnesium_mg?: number;
  vitamin_d_mcg?: number;
  omega3_mg?: number;
  folate_mcg?: number;
  choline_mg?: number;
  iodine_mcg?: number;
};

// Pull the JSON payload out of a model text block.
//
// The block is not always pure JSON. When a parse does a web lookup the model
// narrates first ("Based on Jaffa Miami's actual menu, the platter is served
// with...") and then emits the object. JSON.parse fails on that, so those
// entries silently produced NO component breakdown at all: 27 of 126 stored
// entries, and disproportionately the restaurant ones, since those are exactly
// the parses that narrate. They could not be expanded on Today and were
// invisible to the pantry.
//
// So: strip a code fence if present, and otherwise take the outermost {...}
// span rather than assuming the whole block is the object.
function stripFences(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  if (body.startsWith("{")) return body;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

function optNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && v != null && v !== "" ? n : undefined;
}

function normalizeItems(arr: unknown): ComponentItem[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      name: typeof i.name === "string" ? i.name : "",
      quantity: typeof i.quantity === "string" ? i.quantity : "",
      calories: Number(i.calories) || 0,
      protein_g: Number(i.protein_g) || 0,
      carbs_g: Number(i.carbs_g) || 0,
      fat_g: Number(i.fat_g) || 0,
      fiber_g: optNum(i.fiber_g),
      saturated_fat_g: optNum(i.saturated_fat_g),
      cholesterol_mg: optNum(i.cholesterol_mg),
      iron_mg: optNum(i.iron_mg),
      calcium_mg: optNum(i.calcium_mg),
      magnesium_mg: optNum(i.magnesium_mg),
      vitamin_d_mcg: optNum(i.vitamin_d_mcg),
      omega3_mg: optNum(i.omega3_mg),
      folate_mcg: optNum(i.folate_mcg),
      choline_mg: optNum(i.choline_mg),
      iodine_mcg: optNum(i.iodine_mcg),
    }))
    .filter((i) => i.name !== "");
}

export function extractComponents(raw: unknown): ComponentItem[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  // Already the parsed nutrition object.
  if (Array.isArray(obj.items)) return normalizeItems(obj.items);

  // Anthropic message envelope: items are JSON inside the first text block.
  if (Array.isArray(obj.content)) {
    const block = (obj.content as Array<Record<string, unknown>>).find(
      (b) => b && b.type === "text" && typeof b.text === "string",
    );
    if (block && typeof block.text === "string") {
      try {
        const parsed = JSON.parse(stripFences(block.text)) as {
          items?: unknown;
        };
        return normalizeItems(parsed.items);
      } catch {
        return [];
      }
    }
  }
  return [];
}

// The model's stated assumptions for an entry — which venue menu it used, what
// portion it assumed, whether it took chicken as thigh or breast.
//
// These were parsed and stored from the start but never shown for a food
// entry, and that cost a real correction: a shawarma platter was logged
// against the wrong restaurant menu, and the very first assumption said so
// ("Jaffa Miami menu lists the platter as ... turmeric basmati rice,
// tabbouleh, lemon chickpeas ... this drove the component breakdown"). A wrong
// menu produces a confidently wrong breakdown that looks entirely normal;
// showing the assumption is what makes it catchable.
export function extractAssumptions(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  const fromArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((a): a is string => typeof a === "string" && a.trim() !== "")
      : [];

  if (Array.isArray(obj.assumptions)) return fromArray(obj.assumptions);

  // Anthropic message envelope: the JSON sits inside the first text block.
  if (Array.isArray(obj.content)) {
    const block = (obj.content as Array<Record<string, unknown>>).find(
      (b) => b && b.type === "text" && typeof b.text === "string" && b.text.includes("assumptions"),
    );
    if (block && typeof block.text === "string") {
      try {
        const parsed = JSON.parse(stripFences(block.text)) as {
          assumptions?: unknown;
        };
        return fromArray(parsed.assumptions);
      } catch {
        return [];
      }
    }
  }
  return [];
}
