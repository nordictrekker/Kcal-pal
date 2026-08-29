import { describe, it, expect } from "vitest";
import {
  describeCorrelation,
  lastNDays,
  localDay,
  mean,
  pearson,
  rollingAverage,
} from "@/lib/stats";

describe("localDay and lastNDays", () => {
  it("uses the ISO calendar day and orders days oldest first", () => {
    expect(localDay("2024-06-15T23:30:00Z")).toBe("2024-06-15");
    expect(lastNDays(3, new Date("2024-01-01T12:00:00Z"))).toEqual([
      "2023-12-30",
      "2023-12-31",
      "2024-01-01",
    ]);
  });

  it("crosses month and year boundaries", () => {
    expect(lastNDays(4, new Date("2024-03-01T12:00:00Z"))).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });
});

describe("mean and rollingAverage", () => {
  it("filters null values and returns null when there is no data", () => {
    expect(mean([null, 2, null, 4])).toBe(3);
    expect(mean([null, null])).toBeNull();
    expect(mean([])).toBeNull();
  });

  it("uses a trailing shorter window at the beginning", () => {
    expect(
      rollingAverage(
        [
          { date: "2024-01-01", value: 2 },
          { date: "2024-01-02", value: 4 },
          { date: "2024-01-03", value: null },
          { date: "2024-01-04", value: 8 },
        ],
        3,
      ),
    ).toEqual([
      { date: "2024-01-01", value: 2 },
      { date: "2024-01-02", value: 3 },
      { date: "2024-01-03", value: 3 },
      { date: "2024-01-04", value: 6 },
    ]);
  });
});

describe("pearson", () => {
  it("requires three paired observations and drops incomplete pairs", () => {
    expect(pearson([{ x: 1, y: 2 }, { x: null, y: 3 }])).toEqual({
      r: null,
      n: 1,
    });
    expect(
      pearson([
        { x: 1, y: 1 },
        { x: null, y: 2 },
        { x: 2, y: null },
        { x: 3, y: 3 },
        { x: 4, y: 5 },
      ]).n,
    ).toBe(3);
  });

  it("reports perfect positive and negative correlations", () => {
    expect(
      pearson([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
      ]),
    ).toEqual({ r: 1, n: 3 });
    expect(
      pearson([
        { x: 1, y: 6 },
        { x: 2, y: 4 },
        { x: 3, y: 2 },
      ]),
    ).toEqual({ r: -1, n: 3 });
  });

  it("reports null correlation for zero variance", () => {
    expect(
      pearson([
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
      ]),
    ).toEqual({ r: null, n: 3 });
    expect(
      pearson([
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ]),
    ).toEqual({ r: null, n: 3 });
  });
});

describe("describeCorrelation", () => {
  it("describes missing and threshold-strength relationships", () => {
    expect(describeCorrelation(null)).toBe("not enough data yet");
    expect(describeCorrelation(0.1)).toBe("no clear relationship");
    expect(describeCorrelation(0.2)).toBe("weak positive (r = 0.20)");
    expect(describeCorrelation(0.4)).toBe("moderate positive (r = 0.40)");
    expect(describeCorrelation(0.6)).toBe("strong positive (r = 0.60)");
    expect(describeCorrelation(-0.8)).toBe("strong negative (r = -0.80)");
  });
});
