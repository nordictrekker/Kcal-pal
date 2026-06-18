import { describe, it, expect } from "vitest";
import {
  applyRollingBalance,
  applyRecoveryAdjustment,
  recentIntakeFromRows,
  resolveDailyTargets,
  type RecentDay,
} from "@/lib/daily-targets";
import { normalizeModifiers } from "@/lib/phase-modifiers";
import type { Totals } from "@/lib/food";

const base: Totals = {
  calories: 2000,
  protein_g: 130,
  carbs_g: 220,
  fat_g: 70,
  fiber_g: 30,
};

const day = (key: string, calories: number, carbs_g = 200, complete = true): RecentDay => ({
  key,
  calories,
  carbs_g,
  complete,
});

describe("applyRollingBalance", () => {
  it("trims today after a week of surplus", () => {
    const usable = [1, 2, 3, 4, 5].map((d) => day(`2024-06-0${d}`, 2400));
    const { targets, note } = applyRollingBalance(base, usable);
    // avg surplus +400 → trim ~half (200), capped at 300.
    expect(targets.calories).toBe(1800);
    expect(note).toMatch(/over\/day/);
  });
  it("adds today after a week of deficit", () => {
    const usable = [1, 2, 3, 4, 5].map((d) => day(`2024-06-0${d}`, 1700));
    const { targets } = applyRollingBalance(base, usable);
    expect(targets.calories).toBe(2150); // +300/2 = 150
  });
  it("does nothing with fewer than three days", () => {
    const { targets, note } = applyRollingBalance(base, [day("2024-06-01", 2500)]);
    expect(targets).toEqual(base);
    expect(note).toBeNull();
  });
  it("ignores small drift", () => {
    const usable = [1, 2, 3].map((d) => day(`2024-06-0${d}`, 2040));
    const { note } = applyRollingBalance(base, usable);
    expect(note).toBeNull();
  });
});

describe("applyRecoveryAdjustment", () => {
  it("raises calories on low readiness", () => {
    const { targets, note } = applyRecoveryAdjustment(base, {
      readiness: 60,
      stepsYesterday: null,
      avgSteps: null,
    });
    expect(targets.calories).toBeGreaterThan(base.calories);
    expect(targets.carbs_g).toBeGreaterThan(base.carbs_g);
    expect(note).toMatch(/recovery/i);
  });
  it("does nothing on good readiness and normal activity", () => {
    const { targets, note } = applyRecoveryAdjustment(base, {
      readiness: 85,
      stepsYesterday: 6000,
      avgSteps: 6000,
    });
    expect(targets).toEqual(base);
    expect(note).toBeNull();
  });
  it("no-ops when no recovery signals", () => {
    expect(applyRecoveryAdjustment(base, null).note).toBeNull();
  });
});

describe("recentIntakeFromRows", () => {
  it("buckets by day, excludes today, flags incomplete", () => {
    const rows = [
      { consumed_at: "2024-06-10T08:00:00Z", calories: 500, carbs_g: 50 },
      { consumed_at: "2024-06-10T18:00:00Z", calories: 700, carbs_g: 60 },
      { consumed_at: "2024-06-11T09:00:00Z", calories: 2000, carbs_g: 200 },
      { consumed_at: "2024-06-12T09:00:00Z", calories: 1900, carbs_g: 190 }, // today → excluded
    ];
    const days = recentIntakeFromRows(rows, "2024-06-12", 14, new Set(["2024-06-11"]));
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    expect(byKey["2024-06-10"].calories).toBe(1200);
    expect(byKey["2024-06-11"].complete).toBe(false);
    expect(byKey["2024-06-12"]).toBeUndefined();
  });
});

describe("resolveDailyTargets", () => {
  const inputs = {
    targetInputs: {
      mode: "manual" as const,
      manual: base,
      sex: "female",
      dateOfBirth: "1990-01-01",
      heightIn: 65,
      weightLbs: 150,
      activityLevel: "moderate",
      goal: "maintain",
      proteinPerKg: null,
      ouraTdee7d: null,
    },
    phase: null,
    phaseModifiers: normalizeModifiers(null),
    weightTrendLbsPerWeek: null,
    recovery: null,
  };

  it("excludes under-logged days from the rolling balance", () => {
    // Three real ~2400 days + one partial 200-cal day that should be ignored.
    const recent: RecentDay[] = [
      day("2024-06-04", 2400),
      day("2024-06-03", 2400),
      day("2024-06-02", 2400),
      day("2024-06-01", 200, 20, false), // flagged partial
    ];
    const r = resolveDailyTargets({ ...inputs, recent });
    // Should reflect the surplus from real days (trim), not be dragged up by
    // the fake 200-cal "deficit" day.
    expect(r.targets.calories).toBeLessThan(base.calories);
    expect(r.balanceNote).toMatch(/over\/day/);
  });

  it("drops statistical low-outlier days even when not flagged", () => {
    const recent: RecentDay[] = [
      day("2024-06-04", 2200),
      day("2024-06-03", 2200),
      day("2024-06-02", 2200),
      day("2024-06-01", 150), // complete:true but absurdly low → excluded
    ];
    const r = resolveDailyTargets({ ...inputs, recent });
    expect(r.targets.calories).toBeLessThan(base.calories); // surplus, not deficit
  });
});
