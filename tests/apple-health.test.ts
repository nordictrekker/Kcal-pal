import { describe, it, expect } from "vitest";
import { parseHealthExport } from "@/lib/apple-health";

describe("parseHealthExport JSON", () => {
  it("normalizes metrics, fallbacks, units, and skips invalid rows", () => {
    const out = parseHealthExport(
      JSON.stringify({
        data: {
          metrics: [
            {
              name: "weight_body_mass",
              units: "lb",
              data: [
                { date: "2024-01-03T12:00:00Z", qty: 150 },
                { Date: "2024-01-02T12:00:00Z", Avg: "149.5" },
                { timestamp: "2024-01-01T12:00:00Z", value: 149 },
                { date: "not-a-date", qty: 1 },
                { date: "2024-01-04T12:00:00Z", qty: "not-a-number" },
              ],
            },
          ],
        },
      }),
    );
    expect(out.points).toEqual([
      {
        metric: "body_weight",
        value: 150,
        unit: "lb",
        recorded_at: "2024-01-03T12:00:00.000Z",
        source: "apple_health",
      },
      {
        metric: "body_weight",
        value: 149.5,
        unit: "lb",
        recorded_at: "2024-01-02T12:00:00.000Z",
        source: "apple_health",
      },
      {
        metric: "body_weight",
        value: 149,
        unit: "lb",
        recorded_at: "2024-01-01T12:00:00.000Z",
        source: "apple_health",
      },
    ]);
    expect(out.rangeStart).toBe("2024-01-01");
    expect(out.rangeEnd).toBe("2024-01-03");
  });

  it("normalizes workouts and supports both energy shapes", () => {
    const out = parseHealthExport(
      JSON.stringify({
        data: {
          workouts: [
            {
              name: "Run",
              start: "2024-02-01T10:00:00Z",
              duration: 1500,
              activeEnergyBurned: { qty: 300 },
            },
            {
              name: "Walk",
              start: "2024-02-02T10:00:00Z",
              end: "2024-02-02T10:45:00Z",
              activeEnergyBurned: 120,
            },
          ],
        },
      }),
    );
    expect(out.points).toEqual([
      {
        metric: "workout_minutes",
        value: 25,
        unit: "min",
        recorded_at: "2024-02-01T10:00:00.000Z",
        source: "apple_health:Run",
      },
      {
        metric: "workout_energy",
        value: 300,
        unit: "kcal",
        recorded_at: "2024-02-01T10:00:00.000Z",
        source: "apple_health:Run",
      },
      {
        metric: "workout_minutes",
        value: 45,
        unit: "min",
        recorded_at: "2024-02-02T10:00:00.000Z",
        source: "apple_health:Walk",
      },
      {
        metric: "workout_energy",
        value: 120,
        unit: "kcal",
        recorded_at: "2024-02-02T10:00:00.000Z",
        source: "apple_health:Walk",
      },
    ]);
    expect(out.rangeStart).toBe("2024-02-01");
    expect(out.rangeEnd).toBe("2024-02-02");
  });
});

describe("parseHealthExport CSV", () => {
  it("parses quoted fields, units, and thousands separators", () => {
    const out = parseHealthExport(
      'Date,"Weight (lb)","Steps, total"\n2024-03-02,150,"1,234"\n',
    );
    expect(out.points).toEqual([
      {
        metric: "body_weight",
        value: 150,
        unit: "lb",
        recorded_at: "2024-03-02T00:00:00.000Z",
        source: "apple_health",
      },
      {
        metric: "steps",
        value: 1234,
        unit: null,
        recorded_at: "2024-03-02T00:00:00.000Z",
        source: "apple_health",
      },
    ]);
  });

  it("returns empty output for CSV without dates or without data rows", () => {
    expect(parseHealthExport("Weight (lb),Steps\n150,1234")).toEqual({
      points: [],
      rangeStart: null,
      rangeEnd: null,
    });
    expect(parseHealthExport("Date,Weight (lb)")).toEqual({
      points: [],
      rangeStart: null,
      rangeEnd: null,
    });
  });

  it("falls through from malformed JSON to CSV parsing", () => {
    expect(
      parseHealthExport(
        '{Date,Steps\n2024-03-04,1000',
      ).points,
    ).toEqual([
      {
        metric: "steps",
        value: 1000,
        unit: null,
        recorded_at: "2024-03-04T00:00:00.000Z",
        source: "apple_health",
      },
    ]);
  });
});
