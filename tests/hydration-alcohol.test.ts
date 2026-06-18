import { describe, it, expect } from "vitest";
import {
  mlToOz,
  mlToL,
  computeWaterGoalMl,
  hydrationFactor,
  detectBeverageFluids,
  effectiveFluidMl,
  hydrationPace,
} from "@/lib/hydration";
import {
  computeDrink,
  resolveVolumeMl,
  hydrationOffsetMl,
  DRINKS,
} from "@/lib/alcohol";

describe("hydration units & goal", () => {
  it("converts units", () => {
    expect(mlToOz(250)).toBe(8);
    expect(mlToL(1500)).toBeCloseTo(1.5, 1);
  });
  it("computes a weight+activity goal in a sane band", () => {
    const g = computeWaterGoalMl({ weightLbs: 150, avgSteps: 6000 });
    expect(g).toBeGreaterThanOrEqual(1500);
    expect(g).toBeLessThanOrEqual(4000);
    // More steps → higher goal.
    const active = computeWaterGoalMl({ weightLbs: 150, avgSteps: 14000 });
    expect(active).toBeGreaterThan(g);
  });
  it("falls back when weight is unknown", () => {
    expect(computeWaterGoalMl({ weightLbs: null, avgSteps: null })).toBeGreaterThan(1500);
  });
});

describe("hydrationPace (time-of-day)", () => {
  const target = 2400;
  it("8 oz (~237ml) at 10am is fine, not behind", () => {
    expect(hydrationPace(10, 237, target).status).not.toBe("behind");
  });
  it("the same 8 oz at 2pm is behind", () => {
    expect(hydrationPace(14, 237, target).status).toBe("behind");
  });
  it("early morning is never 'behind'", () => {
    expect(hydrationPace(8, 0, target).status).toBe("early");
  });
  it("reaching the goal reads as met", () => {
    expect(hydrationPace(15, 2400, target).status).toBe("met");
  });
  it("well ahead of pace is flagged ahead", () => {
    expect(hydrationPace(12, 1800, target).status).toBe("ahead");
  });
});

describe("beverage detection", () => {
  it("maps a latte to coffee, not milk", () => {
    const out = detectBeverageFluids([
      { description: "oat milk latte", serving_size: "350ml" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("coffee");
    expect(out[0].ml).toBe(350);
    expect(out[0].effectiveMl).toBeLessThan(out[0].ml); // factor < 1
  });
  it("ignores non-beverages", () => {
    expect(detectBeverageFluids([{ description: "grilled chicken", serving_size: null }])).toHaveLength(0);
  });
  it("hydrationFactor: water 1.0, coffee < 1", () => {
    expect(hydrationFactor("water")).toBe(1);
    expect(hydrationFactor("coffee")).toBeLessThan(1);
  });
  it("effectiveFluidMl weights by factor", () => {
    expect(effectiveFluidMl([{ ml: 100, hydration_factor: 0.9 }, { ml: 100 }])).toBeCloseTo(190, 5);
  });
});

describe("alcohol math", () => {
  it("computeDrink derives grams, standard drinks, calories", () => {
    const r = computeDrink("red_wine", 150);
    // 150 * 0.13 * 0.789 ≈ 15.4 g alcohol
    expect(r.alcohol_g).toBeCloseTo(15.4, 0);
    expect(r.standard_drinks).toBeCloseTo(1.1, 1);
    expect(r.calories).toBe(Math.round(150 * DRINKS.red_wine.kcalPerMl));
  });
  it("resolveVolumeMl handles bottles and glasses", () => {
    expect(resolveVolumeMl("red_wine", "cl75", 0.5)).toBe(375);
    expect(resolveVolumeMl("red_wine", "glass", 1)).toBe(DRINKS.red_wine.defaultGlassMl);
  });
  it("hydrationOffsetMl raises with drinks, capped", () => {
    expect(hydrationOffsetMl(0, 0)).toBe(0);
    expect(hydrationOffsetMl(3, 0)).toBeGreaterThan(0);
    expect(hydrationOffsetMl(20, 20)).toBeLessThanOrEqual(2000);
  });
});
