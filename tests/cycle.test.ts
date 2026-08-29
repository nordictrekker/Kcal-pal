import { describe, it, expect } from "vitest";
import {
  derivedPhases,
  isPhase,
  latestPeriodStart,
  phaseForCycleDay,
  predictCycleDay,
  cycleDayFromPeriodStart,
} from "@/lib/cycle";

describe("cycle phases", () => {
  it("recognizes the supported phases", () => {
    expect(isPhase("menstrual")).toBe(true);
    expect(isPhase("luteal")).toBe(true);
    expect(isPhase("unknown")).toBe(false);
  });

  it("maps default-cycle boundaries to phases", () => {
    expect(phaseForCycleDay(1)).toBe("menstrual");
    expect(phaseForCycleDay(5)).toBe("menstrual");
    expect(phaseForCycleDay(6)).toBe("follicular");
    expect(phaseForCycleDay(12)).toBe("follicular");
    expect(phaseForCycleDay(13)).toBe("ovulatory");
    expect(phaseForCycleDay(15)).toBe("ovulatory");
    expect(phaseForCycleDay(16)).toBe("luteal");
  });

  it("anchors ovulation for long and short cycles", () => {
    expect(phaseForCycleDay(19, { cycleLength: 35, periodLength: 5 })).toBe(
      "follicular",
    );
    expect(phaseForCycleDay(20, { cycleLength: 35, periodLength: 5 })).toBe(
      "ovulatory",
    );
    expect(phaseForCycleDay(23, { cycleLength: 35, periodLength: 5 })).toBe(
      "luteal",
    );
    expect(phaseForCycleDay(5, { cycleLength: 21, periodLength: 5 })).toBe(
      "menstrual",
    );
    expect(phaseForCycleDay(6, { cycleLength: 21, periodLength: 5 })).toBe(
      "ovulatory",
    );
    expect(phaseForCycleDay(9, { cycleLength: 21, periodLength: 5 })).toBe(
      "luteal",
    );
  });

  it("clamps settings and keeps the ovulation floor above a long period", () => {
    expect(phaseForCycleDay(1, { cycleLength: 100, periodLength: 0 })).toBe(
      "menstrual",
    );
    expect(phaseForCycleDay(29, { cycleLength: 100, periodLength: 0 })).toBe(
      "follicular",
    );
    expect(phaseForCycleDay(31, { cycleLength: 100, periodLength: 0 })).toBe(
      "ovulatory",
    );
    expect(
      phaseForCycleDay(11, { cycleLength: 21, periodLength: 10 }),
    ).toBe("ovulatory");
    expect(
      phaseForCycleDay(14, { cycleLength: 21, periodLength: 10 }),
    ).toBe("luteal");
  });
});

describe("predictCycleDay", () => {
  it("returns null without a usable prior entry", () => {
    expect(predictCycleDay(null, "2024-06-10")).toBeNull();
    expect(
      predictCycleDay(
        { date: "2024-06-09", cycle_day: null },
        "2024-06-10",
      ),
    ).toBeNull();
    expect(
      predictCycleDay(
        { date: "not-a-date", cycle_day: 4 },
        "2024-06-10",
      ),
    ).toBeNull();
  });

  it("counts days forward and does not count backward", () => {
    expect(
      predictCycleDay(
        { date: "2024-06-09", cycle_day: 4 },
        "2024-06-12",
      ),
    ).toBe(7);
    expect(
      predictCycleDay(
        { date: "2024-06-12", cycle_day: 7 },
        "2024-06-10",
      ),
    ).toBe(7);
  });
});

describe("cycleDayFromPeriodStart", () => {
  it("starts at day one and rejects a future or invalid start", () => {
    expect(
      cycleDayFromPeriodStart("2024-06-10", undefined, "2024-06-10"),
    ).toBe(1);
    expect(
      cycleDayFromPeriodStart("2024-06-11", undefined, "2024-06-10"),
    ).toBeNull();
    expect(
      cycleDayFromPeriodStart("not-a-date", undefined, "2024-06-10"),
    ).toBeNull();
  });

  it("wraps after the cycle plus grace but not inside grace", () => {
    const settings = { cycleLength: 28, periodLength: 5 };
    expect(
      cycleDayFromPeriodStart("2024-01-01", settings, "2024-01-31"),
    ).toBe(31);
    expect(
      cycleDayFromPeriodStart("2024-01-01", settings, "2024-02-01"),
    ).toBe(4);
  });
});

describe("latestPeriodStart", () => {
  it("finds the latest cluster from unsorted duplicate dates", () => {
    expect(
      latestPeriodStart([
        "2024-04-03",
        "2024-03-01",
        "2024-04-01",
        "2024-04-01",
        "2024-03-02",
      ]),
    ).toBe("2024-04-01");
    expect(latestPeriodStart([])).toBeNull();
  });

  it("bridges one-day gaps but starts a new cluster after larger gaps", () => {
    expect(
      latestPeriodStart(["2024-05-01", "2024-05-03", "2024-05-04"]),
    ).toBe("2024-05-01");
    expect(
      latestPeriodStart(["2024-05-01", "2024-05-04", "2024-05-07"]),
    ).toBe("2024-05-07");
  });
});

describe("derivedPhases", () => {
  it("returns unknown phases when no period start is known", () => {
    expect(
      derivedPhases(null, { cycleLength: 28, periodLength: 5 }, [
        "2024-06-10",
        "2024-06-11",
      ]),
    ).toEqual([
      { date: "2024-06-10", phase: null },
      { date: "2024-06-11", phase: null },
    ]);
  });

  it("maps each day from the period start to its phase", () => {
    expect(
      derivedPhases(
        "2024-06-01",
        { cycleLength: 28, periodLength: 5 },
        [
          "2024-06-01",
          "2024-06-05",
          "2024-06-06",
          "2024-06-13",
          "2024-06-16",
        ],
      ),
    ).toEqual([
      { date: "2024-06-01", phase: "menstrual" },
      { date: "2024-06-05", phase: "menstrual" },
      { date: "2024-06-06", phase: "follicular" },
      { date: "2024-06-13", phase: "ovulatory" },
      { date: "2024-06-16", phase: "luteal" },
    ]);
  });
});
