// Weekly digest: a short, warm narrative summary of the week's data,
// written by Opus. Deliberately small in scope — one Anthropic call per
// week (cached in weekly_digests), ~150 words, present-tense, no advice
// the rules engine wouldn't also give. The point is reflection, not coaching.

import { getAnthropic, NUTRITION_MODEL } from "./anthropic";
import type { Trends } from "./trends";
import type { Phase } from "./cycle";

export type DigestInput = {
  weekLabel: string; // "Jun 8 – Jun 14"
  phase: Phase | null;
  cycleDay: number | null;
  trends: Trends;
  hydration: {
    targetMl: number;
    avgMl7: number | null;
  };
  weight: {
    latestLbs: number | null;
    weekDeltaLbs: number | null; // positive = gained, negative = lost
  };
  activity: {
    stepsAvg7d: number | null;
  };
};

const DIGEST_SYSTEM_PROMPT = [
  "You write a single weekly digest paragraph for a personal nutrition app.",
  "Voice: warm, observant, never preachy. Like a thoughtful friend who happens to know the data — never a coach.",
  "Length: 100–160 words, one paragraph. No bullet points, no headings, no emoji.",
  "Tense: present and second person ('you').",
  "Behavior:",
  "- Lead with what's worth noticing, not what's wrong.",
  "- Honor cycle physiology: extra carbs in luteal phase are biology, not failure.",
  "- Mention at most one gentle suggestion, only if a clear pattern warrants it.",
  "- Never invent numbers. Only reference data given in the prompt.",
  "- Skip filler ('overall', 'in summary', 'great job'). Be specific.",
  "- If data is sparse, say so honestly and keep it brief.",
  "Return only the paragraph text — no JSON, no preamble, no quotes around it.",
].join("\n");

function fmtNum(n: number | null, digits = 0): string {
  if (n === null || !Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function ozFromMl(ml: number | null): string {
  if (ml === null) return "n/a";
  return `${Math.round(ml / 29.5735)} oz`;
}

function buildUserMessage(input: DigestInput): string {
  const t = input.trends;
  const lines: string[] = [];
  lines.push(`Week of ${input.weekLabel}.`);
  if (input.phase) {
    lines.push(
      `Currently in ${input.phase} phase${
        input.cycleDay ? ` (day ${input.cycleDay})` : ""
      }.`,
    );
  }
  lines.push("");
  lines.push("7-day averages (only days with food logged):");
  lines.push(`- Calories: ${fmtNum(t.avgCalories7)} kcal`);
  lines.push(`- Protein: ${fmtNum(t.avgProtein7)} g`);
  lines.push(`- Carbs: ${fmtNum(t.avgCarbs7)} g`);
  lines.push(`- Fiber: ${fmtNum(t.avgFiber7)} g`);
  lines.push(`- Water: ${ozFromMl(input.hydration.avgMl7)} (target ${ozFromMl(input.hydration.targetMl)})`);
  lines.push("");
  lines.push("Recovery (Oura, 7-day avg):");
  lines.push(`- Readiness: ${fmtNum(t.avgReadiness7)}`);
  lines.push(`- Sleep score: ${fmtNum(t.avgSleep7)}`);
  lines.push(`- HRV: ${fmtNum(t.avgHrv7, 1)} ms`);
  if (t.readinessTrend7 !== null) {
    const dir =
      t.readinessTrend7 > 0.5
        ? "trending up"
        : t.readinessTrend7 < -0.5
          ? "trending down"
          : "flat";
    lines.push(`- Readiness trend: ${dir} (${t.readinessTrend7.toFixed(1)} pts/day)`);
  }
  lines.push("");
  lines.push("Patterns:");
  lines.push(`- Days under protein target (last 7): ${t.daysUnderProtein7}`);
  lines.push(`- Days over carbs target (last 7): ${t.daysOverCarbs7}`);
  lines.push(`- Days under fiber target (last 7): ${t.daysUnderFiber7}`);
  if (t.underProteinStreak)
    lines.push(`- Current under-protein streak: ${t.underProteinStreak} days`);
  if (t.overCarbsStreak)
    lines.push(`- Current over-carbs streak: ${t.overCarbsStreak} days`);
  lines.push("");
  lines.push("Activity:");
  lines.push(`- Avg daily steps: ${fmtNum(input.activity.stepsAvg7d)}`);
  lines.push("");
  lines.push("Body weight:");
  if (input.weight.latestLbs !== null) {
    lines.push(`- Latest: ${input.weight.latestLbs.toFixed(1)} lb`);
  }
  if (input.weight.weekDeltaLbs !== null) {
    const sign = input.weight.weekDeltaLbs > 0 ? "+" : "";
    lines.push(`- 7-day change: ${sign}${input.weight.weekDeltaLbs.toFixed(1)} lb`);
  }
  lines.push("");
  lines.push("Write the digest paragraph now.");
  return lines.join("\n");
}

export async function generateDigest(input: DigestInput): Promise<
  { ok: true; summary: string } | { ok: false; error: string }
> {
  try {
    const resp = await getAnthropic().messages.create(
      {
        model: NUTRITION_MODEL,
        max_tokens: 400,
        system: DIGEST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      },
      { timeout: 30_000 },
    );

    if (resp.stop_reason === "refusal") {
      return { ok: false, error: "Model declined to write the digest." };
    }

    let text = "";
    for (const block of resp.content) {
      if (block.type === "text") {
        text += block.text;
      }
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

// ISO 8601 week key for cache lookup. Returns e.g. "2026-W24".
export function isoYearWeek(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // Thursday of this week determines the ISO year.
  const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Human-readable week range label, e.g. "Jun 8 – Jun 14".
export function weekLabel(today = new Date()): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return `${fmt(start)} – ${fmt(end)}`;
}
