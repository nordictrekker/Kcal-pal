import { describe, it, expect } from "vitest";
import {
  applyPhaseModifiers,
  DEFAULT_PHASE_MODIFIERS,
  describeAdjustments,
  normalizeModifiers,
} from "@/lib/phase-modifiers";

describe("normalizeModifiers", () => {
  it("returns defaults for invalid input and ignores unknown keys", () => {
    for (const raw of [null, undefined, "bad", 4, []]) {
      expect(normalizeModifiers(raw)).toEqual(DEFAULT_PHASE_MODIFIERS);
    }
    expect(
      normalizeModifiers({
        luteal: { calories: 1.2 },
        extra: { calories: 0.5 },
      }).luteal,
    ).toEqual({
      calories: 1.2,
      protein: 1,
      carbs: 1,
      fat: 1,
      fiber: 1,
    });
    expect(normalizeModifiers({}).follicular).toEqual(
      DEFAULT_PHASE_MODIFIERS.follicular,
    );
  });

  it("normalizes non-finite values and clamps valid numbers", () => {
    expect(
      normalizeModifiers({
        menstrual: {
          calories: "1.2",
          protein: Number.NaN,
          carbs: Number.POSITIVE_INFINITY,
          fat: 0.1,
          fiber: 2,
        },
      }).menstrual,
    ).toEqual({
      calories: 1,
      protein: 1,
      carbs: 1,
      fat: 0.5,
      fiber: 1.5,
    });
  });
});

describe("applyPhaseModifiers", () => {
  const base = {
    calories: 2000,
    protein_g: 100,
    carbs_g: 200,
    fat_g: 70,
    fiber_g: 30,
  };

  it("passes through the base when phase is unknown", () => {
    expect(
      applyPhaseModifiers(base, null, DEFAULT_PHASE_MODIFIERS),
    ).toBe(base);
  });

  it("applies and rounds luteal multipliers", () => {
    expect(
      applyPhaseModifiers(base, "luteal", DEFAULT_PHASE_MODIFIERS),
    ).toEqual({
      calories: 2100,
      protein_g: 100,
      carbs_g: 180,
      fat_g: 81,
      fiber_g: 33,
    });
  });
});

describe("describeAdjustments", () => {
  it("returns null when all multipliers are one", () => {
    expect(describeAdjustments(DEFAULT_PHASE_MODIFIERS.ovulatory)).toBeNull();
  });

  it("formats changed values in the documented label order", () => {
    expect(describeAdjustments(DEFAULT_PHASE_MODIFIERS.luteal)).toBe(
      "kcal +5%, C -10%, F +15%, Fib +10%",
    );
  });
});
