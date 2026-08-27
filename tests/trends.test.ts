import { describe, it, expect } from "vitest";
import { buildTrends } from "@/lib/trends";

const TODAY = new Date("2024-06-15T12:00:00Z");
const TARGETS = {
  calories: 2000,
  protein_g: 100,
  carbs_g: 200,
  fat_g: 70,
  fiber_g: 30,
};

function food(date: string, values: Partial<{
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
}> = {}) {
  return {
    consumed_at: `${date}T12:00:00Z`,
    calories: values.calories ?? 0,
    protein_g: values.protein_g ?? 0,
    carbs_g: values.carbs_g ?? 0,
    fat_g: values.fat_g ?? 0,
    fiber_g: values.fiber_g ?? 0,
  };
}

function trends(
  overrides: Partial<Parameters<typeof buildTrends>[0]> = {},
) {
  return buildTrends({
    food: [],
    oura: [],
    cycle: [],
    water: [],
    targets: TARGETS,
    days: 7,
    today: TODAY,
    ...overrides,
  });
}

describe("buildTrends macro rollups", () => {
  it("buckets and sums in-window rows, treating nulls as zero", () => {
    const out = trends({
      food: [
        food("2024-06-12", {
          calories: 500,
          protein_g: 20,
          carbs_g: null,
          fat_g: 10,
          fiber_g: 4,
        }),
        food("2024-06-12", { calories: 300, protein_g: 10, carbs_g: 20 }),
        food("2024-06-15", { calories: 100, protein_g: 5 }),
        food("2024-06-08", { calories: 999 }),
        food("2024-06-16", { calories: 999 }),
      ],
    });
    expect(out.macros).toEqual([
      { date: "2024-06-09", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: false },
      { date: "2024-06-10", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: false },
      { date: "2024-06-11", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: false },
      { date: "2024-06-12", calories: 800, protein_g: 30, carbs_g: 20, fat_g: 10, fiber_g: 4, hasEntries: true },
      { date: "2024-06-13", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: false },
      { date: "2024-06-14", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: false },
      { date: "2024-06-15", calories: 100, protein_g: 5, carbs_g: 0, fat_g: 0, fiber_g: 0, hasEntries: true },
    ]);
  });

  it("counts only logged days against the target thresholds", () => {
    const out = trends({
      food: [
        food("2024-06-09", { protein_g: 90, carbs_g: 200, fiber_g: 27 }),
        food("2024-06-10", { protein_g: 89, carbs_g: 201, fiber_g: 26 }),
        food("2024-06-11", { protein_g: 90, carbs_g: 200, fiber_g: 27 }),
        food("2024-06-12", { protein_g: 89, carbs_g: 201, fiber_g: 26 }),
        food("2024-06-13", { protein_g: 50, carbs_g: 250, fiber_g: 10 }),
        food("2024-06-15", { protein_g: 50, carbs_g: 250, fiber_g: 10 }),
      ],
    });
    expect(out.daysUnderProtein7).toBe(4);
    expect(out.daysOverCarbs7).toBe(4);
    expect(out.daysUnderFiber7).toBe(4);
  });
});

describe("buildTrends streaks", () => {
  it("ends streaks at yesterday and excludes today's partial day", () => {
    const out = trends({
      food: [
        food("2024-06-12", { protein_g: 50, carbs_g: 250 }),
        food("2024-06-13", { protein_g: 50, carbs_g: 250 }),
        food("2024-06-14", { protein_g: 50, carbs_g: 250 }),
        food("2024-06-15", { protein_g: 0, carbs_g: 0 }),
      ],
    });
    expect(out.underProteinStreak).toBe(3);
    expect(out.overCarbsStreak).toBe(3);
    expect(out.proteinHitStreak).toBeNull();
  });

  it("breaks streaks at a logging gap and returns null without a streak", () => {
    expect(
      trends({
        food: [
          food("2024-06-13", { protein_g: 100 }),
          food("2024-06-14", { protein_g: 100 }),
        ],
      }).proteinHitStreak,
    ).toBe(2);
    expect(
      trends({ food: [food("2024-06-14", { protein_g: 100 })] })
        .proteinHitStreak,
    ).toBe(1);
    expect(trends().underProteinStreak).toBeNull();
    expect(trends().overCarbsStreak).toBeNull();
  });
});

describe("buildTrends averages and readiness", () => {
  it("averages logged macro days only and handles missing data", () => {
    const out = trends({
      food: [
        food("2024-06-12", { calories: 1000, protein_g: 40, carbs_g: 80, fiber_g: 10 }),
        food("2024-06-15", { calories: 2000, protein_g: 80, carbs_g: 160, fiber_g: 20 }),
      ],
    });
    expect(out.avgCalories7).toBe(1500);
    expect(out.avgProtein7).toBe(60);
    expect(out.avgCarbs7).toBe(120);
    expect(out.avgFiber7).toBe(15);
    expect(trends().avgCalories7).toBeNull();
  });

  it("averages Oura values and calculates a rising readiness slope", () => {
    const out = trends({
      oura: [
        { date: "2024-06-13", sleep_score: 70, hrv_avg: 40, readiness_score: 60 },
        { date: "2024-06-14", sleep_score: 80, hrv_avg: 50, readiness_score: 70 },
        { date: "2024-06-15", sleep_score: 90, hrv_avg: 60, readiness_score: 80 },
      ],
    });
    expect(out.avgReadiness7).toBe(70);
    expect(out.avgSleep7).toBe(80);
    expect(out.avgHrv7).toBe(50);
    expect(out.readinessTrend7).toBe(10);
    expect(
      trends({
        oura: [
          { date: "2024-06-14", sleep_score: null, hrv_avg: null, readiness_score: 70 },
          { date: "2024-06-15", sleep_score: null, hrv_avg: null, readiness_score: 80 },
        ],
      }).readinessTrend7,
    ).toBeNull();
  });

  it("applies hydration factors and defaults a null factor to one", () => {
    expect(
      trends({
        water: [
          { logged_at: "2024-06-13T12:00:00Z", ml: 1000, hydration_factor: 1 },
          { logged_at: "2024-06-14T12:00:00Z", ml: 500, hydration_factor: 0.9 },
          { logged_at: "2024-06-15T12:00:00Z", ml: 200, hydration_factor: null },
        ],
      }).avgWaterMl7,
    ).toBe(550);
    expect(trends().avgWaterMl7).toBeNull();
  });
});

describe("buildTrends phase streak", () => {
  it("counts the current phase through unknown intermediate days", () => {
    expect(
      trends({
        cycle: [
          { date: "2024-06-12", phase: "follicular" },
          { date: "2024-06-14", phase: "follicular" },
          { date: "2024-06-15", phase: "follicular" },
        ],
      }).phaseStreak,
    ).toBe(3);
    expect(
      trends({
        cycle: [
          { date: "2024-06-14", phase: "luteal" },
          { date: "2024-06-15", phase: "follicular" },
        ],
      }).phaseStreak,
    ).toBe(1);
    expect(
      trends({ cycle: [{ date: "2024-06-14", phase: "follicular" }] })
        .phaseStreak,
    ).toBeNull();
  });
});
