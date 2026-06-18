import { describe, it, expect } from "vitest";
import {
  haversineKm,
  offsetDiffHours,
  classifyTravel,
  travelInfoFrom,
  travelHydrationOffsetMl,
} from "@/lib/travel";

const BERLIN = { lat: 52.52, lng: 13.405 };
const CAPETOWN = { lat: -33.92, lng: 18.42 };
const PARIS = { lat: 48.85, lng: 2.35 };
const NYC = { lat: 40.71, lng: -74.0 };

describe("geo helpers", () => {
  it("haversine distance is sane", () => {
    const d = haversineKm(BERLIN, CAPETOWN);
    expect(d).toBeGreaterThan(8000);
    expect(d).toBeLessThan(10000);
    expect(haversineKm(BERLIN, { lat: null, lng: null })).toBe(0);
  });
  it("offsetDiffHours: NY is hours behind Paris", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    expect(offsetDiffHours("Europe/Paris", "America/New_York", now)).toBeLessThan(-4);
  });
});

describe("classifyTravel", () => {
  const now = new Date("2024-06-15T12:00:00Z");
  it("jet lag on a meaningful offset change", () => {
    const c = classifyTravel(
      {
        home_tz: "America/New_York",
        current_tz: "Europe/Paris",
        current_label: null,
        home_lat: NYC.lat, home_lng: NYC.lng,
        current_lat: PARIS.lat, current_lng: PARIS.lng,
        travel_started_at: null,
      },
      now,
    );
    expect(c?.kind).toBe("jetlag");
  });
  it("long-haul on big distance with ~no offset (Berlin→Cape Town)", () => {
    const c = classifyTravel(
      {
        home_tz: "Europe/Berlin",
        current_tz: "Africa/Johannesburg", // ~0-1h offset from Berlin in summer
        current_label: null,
        home_lat: BERLIN.lat, home_lng: BERLIN.lng,
        current_lat: CAPETOWN.lat, current_lng: CAPETOWN.lng,
        travel_started_at: null,
      },
      now,
    );
    expect(c?.kind).toBe("longhaul");
  });
  it("ignores same-zone short hops (Madrid→Paris)", () => {
    const c = classifyTravel(
      {
        home_tz: "Europe/Madrid",
        current_tz: "Europe/Paris",
        current_label: null,
        home_lat: 40.4, home_lng: -3.7,
        current_lat: PARIS.lat, current_lng: PARIS.lng,
        travel_started_at: null,
      },
      now,
    );
    expect(c).toBeNull();
  });
  it("manual travel always classifies", () => {
    const c = classifyTravel(
      { home_tz: null, current_tz: null, current_label: null, home_lat: null, home_lng: null, current_lat: null, current_lng: null, travel_started_at: null, travel_manual: true },
      now,
    );
    expect(c?.kind).toBe("manual");
  });
});

describe("travelInfoFrom", () => {
  const now = new Date("2024-06-15T12:00:00Z");
  it("active within the window, with a hydration bump", () => {
    const info = travelInfoFrom(
      {
        home_tz: "America/New_York",
        current_tz: "Europe/Paris",
        current_label: "Paris",
        home_lat: NYC.lat, home_lng: NYC.lng,
        current_lat: PARIS.lat, current_lng: PARIS.lng,
        travel_started_at: "2024-06-15T06:00:00Z",
      },
      now,
    );
    expect(info?.active).toBe(true);
    expect(info?.kind).toBe("jetlag");
    expect(travelHydrationOffsetMl(info)).toBeGreaterThan(0);
  });
  it("null without a start timestamp", () => {
    expect(
      travelInfoFrom(
        { home_tz: "A", current_tz: "B", current_label: null, home_lat: null, home_lng: null, current_lat: null, current_lng: null, travel_started_at: null },
        now,
      ),
    ).toBeNull();
  });
});
