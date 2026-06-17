// City search via Open-Meteo's free geocoding API (no key required). Returns
// the IANA timezone and coordinates we need for travel/home-base logic.

import { isValidTimeZone } from "./timezone";

export type CityResult = {
  id: string;
  label: string; // "Paris, Île-de-France, France"
  tz: string;
  lat: number;
  lng: number;
};

type RawCity = {
  id?: number;
  name?: string;
  admin1?: string;
  country?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
};

export async function searchCities(query: string): Promise<CityResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" +
    encodeURIComponent(q);

  let data: { results?: RawCity[] };
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    data = await resp.json();
  } catch {
    return [];
  }

  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .filter(
      (r): r is Required<Pick<RawCity, "timezone" | "latitude" | "longitude" | "name">> &
        RawCity =>
        typeof r.timezone === "string" &&
        isValidTimeZone(r.timezone) &&
        typeof r.latitude === "number" &&
        typeof r.longitude === "number" &&
        typeof r.name === "string",
    )
    .map((r) => ({
      id: String(r.id ?? `${r.name}-${r.latitude}`),
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      tz: r.timezone,
      lat: r.latitude,
      lng: r.longitude,
    }));
}
