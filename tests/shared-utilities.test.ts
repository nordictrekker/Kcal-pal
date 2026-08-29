import { describe, it, expect } from "vitest";
import {
  backdatedConsumedAt,
  isDayKey,
  parseNumber,
  readNumberOrNull,
  todayKey,
} from "@/lib/form-values";
import {
  isActivityLevel,
  isBodyBuild,
  isCalendarDate,
  isGoal,
  isSex,
  isTargetMode,
} from "@/lib/profile";
import { NUTRIENT_COLUMNS, nutrientColumnsFromForm, pickNutrientColumns } from "@/lib/food";
import { mlToOz, ozToMl } from "@/lib/hydration";

describe("readNumberOrNull", () => {
  it("treats blank, missing and negative values as null", () => {
    expect(readNumberOrNull(null)).toBeNull();
    expect(readNumberOrNull(undefined)).toBeNull();
    expect(readNumberOrNull("")).toBeNull();
    expect(readNumberOrNull("  ")).toBeNull();
    expect(readNumberOrNull("-3")).toBeNull();
    expect(readNumberOrNull("abc")).toBeNull();
  });

  it("reads valid non-negative numbers", () => {
    expect(readNumberOrNull("0")).toBe(0);
    expect(readNumberOrNull(" 12.5 ")).toBe(12.5);
  });
});

describe("parseNumber", () => {
  it("flags an empty field separately from an invalid one", () => {
    expect(parseNumber("", { min: 0, max: 10 })).toEqual({ ok: false, empty: true });
    expect(parseNumber("99", { min: 0, max: 10 })).toEqual({
      ok: false,
      empty: false,
    });
  });

  it("honours inclusive and exclusive minimums", () => {
    expect(parseNumber("0", { min: 0, max: 10 })).toEqual({ ok: true, value: 0 });
    expect(parseNumber("0", { min: 0, max: 10, exclusiveMin: true })).toEqual({
      ok: false,
      empty: false,
    });
  });

  it("rejects non-integers for integer fields", () => {
    expect(parseNumber("28.5", { min: 21, max: 45, integer: true })).toEqual({
      ok: false,
      empty: false,
    });
    expect(parseNumber("28", { min: 21, max: 45, integer: true })).toEqual({
      ok: true,
      value: 28,
    });
  });
});

describe("day keys and back-dating", () => {
  it("recognises only YYYY-MM-DD strings", () => {
    expect(isDayKey("2026-02-03")).toBe(true);
    expect(isDayKey("2026-2-3")).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });

  it("derives today's key in UTC", () => {
    expect(todayKey(new Date("2026-02-03T23:30:00Z"))).toBe("2026-02-03");
  });

  it("anchors a past day to noon and leaves today/future alone", () => {
    const now = new Date("2026-02-03T08:00:00Z");
    expect(backdatedConsumedAt("2026-02-01", now)).toBe("2026-02-01T12:00:00.000Z");
    expect(backdatedConsumedAt("2026-02-03", now)).toBeNull();
    expect(backdatedConsumedAt("2026-02-05", now)).toBeNull();
    expect(backdatedConsumedAt("nonsense", now)).toBeNull();
    expect(backdatedConsumedAt(null, now)).toBeNull();
  });
});

describe("profile guards", () => {
  it("accepts known enum values only", () => {
    expect(isSex("female")).toBe(true);
    expect(isSex("f")).toBe(false);
    expect(isActivityLevel("very_active")).toBe(true);
    expect(isActivityLevel("athlete")).toBe(false);
    expect(isGoal("muscle")).toBe(true);
    expect(isBodyBuild("higher_fat")).toBe(true);
    expect(isTargetMode("auto")).toBe(true);
    expect(isTargetMode("automatic")).toBe(false);
  });

  it("validates calendar dates", () => {
    expect(isCalendarDate("1990-07-14")).toBe(true);
    expect(isCalendarDate("1990-13-01")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("nutrient column helpers", () => {
  it("copies every nutrient column from a row, nulling non-numbers", () => {
    const picked = pickNutrientColumns({
      calories: 300,
      protein_g: 20,
      fat_g: "12",
      description: "oats",
    });
    expect(Object.keys(picked)).toEqual([...NUTRIENT_COLUMNS]);
    expect(picked.calories).toBe(300);
    expect(picked.protein_g).toBe(20);
    expect(picked.fat_g).toBeNull();
    expect(picked.iodine_mcg).toBeNull();
  });

  it("reads every nutrient column out of a form", () => {
    const form = new FormData();
    form.set("calories", "410");
    form.set("protein_g", "");
    form.set("iron_mg", "-1");
    const cols = nutrientColumnsFromForm(form);
    expect(Object.keys(cols)).toEqual([...NUTRIENT_COLUMNS]);
    expect(cols.calories).toBe(410);
    expect(cols.protein_g).toBeNull();
    expect(cols.iron_mg).toBeNull();
  });
});

describe("hydration conversions", () => {
  it("round-trips ounces through millilitres", () => {
    expect(ozToMl(16)).toBe(473);
    expect(mlToOz(473)).toBe(16);
  });
});
