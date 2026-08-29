import { afterEach, describe, it, expect, vi } from "vitest";
import { searchCities } from "@/lib/geocode";

describe("searchCities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not fetch queries shorter than two non-whitespace characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchCities("a")).toEqual([]);
    expect(await searchCities("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty list for network, HTTP, and malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await searchCities("Paris")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await searchCities("Paris")).toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: {} }) }),
    );
    expect(await searchCities("Paris")).toEqual([]);
  });

  it("filters invalid rows, builds labels, and falls back for missing ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Paris",
              admin1: "Île-de-France",
              country: "France",
              timezone: "Europe/Paris",
              latitude: 48.8566,
              longitude: 2.3522,
            },
            {
              id: 2,
              name: "Bad timezone",
              timezone: "No/Such_Zone",
              latitude: 1,
              longitude: 2,
            },
            {
              id: 3,
              name: "Missing coords",
              timezone: "Europe/Paris",
              latitude: "1",
              longitude: 2,
            },
            {
              id: 4,
              name: undefined,
              timezone: "Europe/Paris",
              latitude: 1,
              longitude: 2,
            },
          ],
        }),
      }),
    );
    expect(await searchCities(" Paris ")).toEqual([
      {
        id: "Paris-48.8566",
        label: "Paris, Île-de-France, France",
        tz: "Europe/Paris",
        lat: 48.8566,
        lng: 2.3522,
      },
    ]);
  });

  it("trims and URL-encodes the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            name: "New York",
            timezone: "America/New_York",
            latitude: 40.7,
            longitude: -74,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await searchCities(" New York ");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("name=New%20York"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
