import { describe, it, expect } from "vitest";
import {
  computeTargets,
  adaptiveTdeeFromIntake,
  weightTrendLbsPerWeek,
  projectGoalEta,
  type TargetInputs,
} from "@/lib/targets";

const manual = {
  calories: 2000,
  protein_g: 130,
  carbs_g: 220,
  fat_g: 70,
  fiber_g: 30,
};

const baseAuto: TargetInputs = {
  mode: "auto",
  manual,
  sex: "female",
  dateOfBirth: "1990-01-01",
  heightIn: 65,
  weightLbs: 150,
  activityLevel: "moderate",
  goal: "maintain",
  proteinPerKg: null,
  ouraTdee7d: null,
};

describe("computeTargets", () => {
  it("manual mode returns the stored numbers", () => {
    const r = computeTargets({ ...baseAuto, mode: "manual" });
    expect(r.source).toBe("manual");
    expect(r.targets).toEqual(manual);
  });

  it("falls back to manual when biometrics are missing", () => {
    const r = computeTargets({ ...baseAuto, weightLbs: null });
    expect(r.source).toBe("manual");
  });

  it("prefers adaptive TDEE over Oura and estimate", () => {
    const r = computeTargets({
      ...baseAuto,
      ouraTdee7d: 2200,
      adaptiveTdee: 2400,
    });
    expect(r.source).toBe("adaptive");
    expect(r.tdee).toBe(2400);
  });

  it("uses Oura burn when adaptive is absent", () => {
    const r = computeTargets({ ...baseAuto, ouraTdee7d: 2300 });
    expect(r.source).toBe("oura");
    expect(r.tdee).toBe(2300);
  });

  it("falls back to a formula estimate with no measured data", () => {
    const r = computeTargets(baseAuto);
    expect(r.source).toBe("estimate");
    expect(r.targets.calories).toBeGreaterThan(0);
    expect(r.targets.protein_g).toBeGreaterThan(0);
  });

  it("never prescribes below ~RMR", () => {
    const r = computeTargets({ ...baseAuto, goal: "lose", ouraTdee7d: 1400 });
    // RMR for these stats is ~1350; floor is RMR*1.05 (~1417).
    expect(r.targets.calories).toBeGreaterThan(1300);
  });
});

describe("adaptiveTdeeFromIntake", () => {
  it("infers TDEE from intake minus weight-trend energy", () => {
    // Eating 2000, losing 1 lb/week → burning ~500 more/day → TDEE ~2500.
    const t = adaptiveTdeeFromIntake({
      avgDailyIntake: 2000,
      loggedDays: 14,
      weightTrendLbsPerWeek: -1,
    });
    expect(t).toBe(2500);
  });
  it("requires enough logged days", () => {
    expect(
      adaptiveTdeeFromIntake({ avgDailyIntake: 2000, loggedDays: 5, weightTrendLbsPerWeek: -1 }),
    ).toBeNull();
  });
  it("requires a weight trend", () => {
    expect(
      adaptiveTdeeFromIntake({ avgDailyIntake: 2000, loggedDays: 14, weightTrendLbsPerWeek: null }),
    ).toBeNull();
  });
  it("rejects implausible results", () => {
    expect(
      adaptiveTdeeFromIntake({ avgDailyIntake: 600, loggedDays: 14, weightTrendLbsPerWeek: 0 }),
    ).toBeNull();
  });
});

describe("weightTrendLbsPerWeek", () => {
  it("needs at least four readings", () => {
    expect(
      weightTrendLbsPerWeek([
        { measured_at: "2024-01-01", weight_lbs: 150 },
        { measured_at: "2024-01-08", weight_lbs: 149 },
      ]),
    ).toBeNull();
  });
  it("detects a downward trend", () => {
    const t = weightTrendLbsPerWeek([
      { measured_at: "2024-01-01", weight_lbs: 152 },
      { measured_at: "2024-01-08", weight_lbs: 151 },
      { measured_at: "2024-01-15", weight_lbs: 150 },
      { measured_at: "2024-01-22", weight_lbs: 149 },
    ]);
    expect(t).not.toBeNull();
    expect(t!.lbsPerWeek).toBeLessThan(0);
    expect(t!.lbsPerWeek).toBeCloseTo(-1, 1);
  });
});

describe("projectGoalEta", () => {
  it("returns null when the trend points the wrong way", () => {
    expect(
      projectGoalEta({
        currentLbs: 150,
        goalLbs: 140, // want to lose
        trend: { lbsPerWeek: 0.5, rSquared: 0.9 }, // but gaining
      }),
    ).toBeNull();
  });
  it("projects an ETA when the trend is aligned", () => {
    const eta = projectGoalEta({
      currentLbs: 150,
      goalLbs: 140,
      trend: { lbsPerWeek: -1, rSquared: 0.9 },
    });
    expect(eta).not.toBeNull();
    expect(eta!.weeksAway).toBeCloseTo(10, 0);
  });
});

describe("build & muscle-goal protein", () => {
  const base = {
    mode: "auto" as const,
    manual: { calories: 2000, protein_g: 130, carbs_g: 220, fat_g: 70, fiber_g: 30 },
    sex: "male",
    dateOfBirth: "1990-01-01",
    heightIn: 71,
    weightLbs: 176, // ~80 kg
    activityLevel: "moderate",
    goal: "maintain",
    proteinPerKg: null,
    ouraTdee7d: null,
  };

  it("build multiplier scales protein; average matches previous behavior", () => {
    const avg = computeTargets({ ...base, bodyBuild: "average" });
    const none = computeTargets({ ...base });
    expect(avg.targets.protein_g).toBe(none.targets.protein_g);
    const musc = computeTargets({ ...base, bodyBuild: "muscular" });
    const soft = computeTargets({ ...base, bodyBuild: "higher_fat" });
    expect(musc.targets.protein_g).toBeGreaterThan(avg.targets.protein_g);
    expect(soft.targets.protein_g).toBeLessThan(avg.targets.protein_g);
  });

  it("muscle goal: 2.2 g/kg protein and a lean surplus", () => {
    const maintain = computeTargets({ ...base });
    const muscle = computeTargets({ ...base, goal: "muscle" });
    expect(muscle.targets.protein_g).toBeGreaterThan(maintain.targets.protein_g);
    expect(muscle.targets.calories).toBe(maintain.targets.calories + 150);
  });
});
