import { describe, it, expect } from "vitest";
import {
  localDayKey,
  localDayBoundsUTC,
  addDaysToKey,
  zoneOffsetMinutes,
  describeZone,
  isValidTimeZone,
} from "@/lib/timezone";

describe("localDayKey", () => {
  it("uses the zone's local calendar date", () => {
    const at = new Date("2024-06-15T23:30:00Z");
    // 23:30 UTC is still the 15th in New York (UTC-4) and already the 16th in Tokyo.
    expect(localDayKey("America/New_York", at)).toBe("2024-06-15");
    expect(localDayKey("Asia/Tokyo", at)).toBe("2024-06-16");
  });
  it("falls back to UTC date when tz is missing/invalid", () => {
    const at = new Date("2024-06-15T23:30:00Z");
    expect(localDayKey(null, at)).toBe("2024-06-15");
    expect(localDayKey("Not/AZone", at)).toBe("2024-06-15");
  });
});

describe("localDayBoundsUTC", () => {
  it("returns the UTC instants of a local day", () => {
    // NY midnight on 2024-06-15 (EDT, UTC-4) = 04:00 UTC.
    const { start, end } = localDayBoundsUTC("America/New_York", "2024-06-15");
    expect(start).toBe("2024-06-15T04:00:00.000Z");
    expect(end).toBe("2024-06-16T04:00:00.000Z");
  });
  it("UTC fallback spans exactly the calendar day", () => {
    const { start, end } = localDayBoundsUTC(null, "2024-06-15");
    expect(start).toBe("2024-06-15T00:00:00.000Z");
    expect(end).toBe("2024-06-16T00:00:00.000Z");
  });
});

describe("addDaysToKey", () => {
  it("shifts whole days across month/leap boundaries", () => {
    expect(addDaysToKey("2024-06-15", -1)).toBe("2024-06-14");
    expect(addDaysToKey("2024-06-15", 1)).toBe("2024-06-16");
    expect(addDaysToKey("2024-03-01", -1)).toBe("2024-02-29"); // leap year
    expect(addDaysToKey("2023-03-01", -1)).toBe("2023-02-28");
  });
});

describe("zoneOffsetMinutes / helpers", () => {
  it("computes a sane offset and validates zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Nope")).toBe(false);
    expect(zoneOffsetMinutes("UTC", new Date("2024-06-15T12:00:00Z"))).toBe(0);
    // NY in summer is UTC-4 → -240 minutes.
    expect(
      zoneOffsetMinutes("America/New_York", new Date("2024-06-15T12:00:00Z")),
    ).toBe(-240);
  });
  it("describeZone humanizes the city", () => {
    expect(describeZone("America/Los_Angeles")).toBe("Los Angeles");
    expect(describeZone("Europe/Paris")).toBe("Paris");
  });
});
