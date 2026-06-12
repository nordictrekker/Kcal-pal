// Eight Sleep API client — unofficial.
// Eight Sleep has no public API. This replicates the auth flow used by
// the open-source pyEight library (https://github.com/mezz64/pyEight).
// Endpoints and client credentials below are public knowledge from
// pyEight's source. Eight Sleep has changed this API before; if they
// change it again the auth call will 401/404 and we surface the error
// rather than fabricate data.

const AUTH_URL = "https://auth-api.8slp.net/v1/tokens";
const API_BASE = "https://client-api.8slp.net/v1";

// From pyEight — the iOS app's OAuth client. Update if pyEight bumps them.
const CLIENT_ID = "0894c7f33bb94800a03f1f4df13a4f38";
const CLIENT_SECRET =
  "f0954a3ed5763ba3d06834c73731a32f15f168f47d4f164751275def86db0c76";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  userId: string;
}

interface IntervalsResponse {
  intervals: Interval[];
}

// Time-series entry: [timestamp, value]
type TimeSeries = Array<[string, number]>;

interface Interval {
  id: string;
  ts: string;
  score: number | null;
  stages?: Array<{ stage: string; duration: number }>;
  timeseries?: {
    tnt?: TimeSeries;
    tempBedC?: TimeSeries;
    tempRoomC?: TimeSeries;
    heartRate?: TimeSeries;
    hrv?: TimeSeries;
    respiratoryRate?: TimeSeries;
  };
}

export interface EightSleepDailyRow {
  date: string;
  sleep_score: number | null;
  total_sleep_min: number | null;
  hrv_avg: number | null;
  resting_hr: number | null;
  bed_temp_avg_f: number | null;
  toss_turns: number | null;
  raw: Record<string, unknown>;
}

async function login(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "password",
      username: email,
      password,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Eight Sleep auth ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

async function getIntervals(
  accessToken: string,
  userId: string,
): Promise<IntervalsResponse> {
  const res = await fetch(`${API_BASE}/users/${userId}/intervals`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Eight Sleep intervals ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as IntervalsResponse;
}

function avg(ts: TimeSeries | undefined): number | null {
  if (!ts || ts.length === 0) return null;
  const sum = ts.reduce((a, [, v]) => a + v, 0);
  return sum / ts.length;
}

function minNum(ts: TimeSeries | undefined): number | null {
  if (!ts || ts.length === 0) return null;
  let m = Infinity;
  for (const [, v] of ts) if (v < m) m = v;
  return Number.isFinite(m) ? m : null;
}

function sumNum(ts: TimeSeries | undefined): number | null {
  if (!ts || ts.length === 0) return null;
  return ts.reduce((a, [, v]) => a + v, 0);
}

function cToF(c: number | null): number | null {
  return c === null ? null : (c * 9) / 5 + 32;
}

function intervalDate(iv: Interval): string {
  // Use the calendar date of the sleep start (typically late evening).
  return new Date(iv.ts).toISOString().slice(0, 10);
}

function intervalToRow(iv: Interval): EightSleepDailyRow {
  const ts = iv.timeseries ?? {};
  // Sleep stages durations are in seconds. Sum any non-awake stage.
  const totalSleepSec = (iv.stages ?? [])
    .filter((s) => s.stage !== "awake" && s.stage !== "out")
    .reduce((a, s) => a + (s.duration ?? 0), 0);

  return {
    date: intervalDate(iv),
    sleep_score: typeof iv.score === "number" ? Math.round(iv.score) : null,
    total_sleep_min:
      totalSleepSec > 0 ? Math.round(totalSleepSec / 60) : null,
    hrv_avg: avg(ts.hrv),
    resting_hr: minNum(ts.heartRate)
      ? Math.round(minNum(ts.heartRate) as number)
      : null,
    bed_temp_avg_f: cToF(avg(ts.tempBedC)),
    toss_turns: sumNum(ts.tnt)
      ? Math.round(sumNum(ts.tnt) as number)
      : null,
    raw: iv as unknown as Record<string, unknown>,
  };
}

export async function fetchEightSleepDaily(args: {
  email: string;
  password: string;
}): Promise<EightSleepDailyRow[]> {
  const token = await login(args.email, args.password);
  const data = await getIntervals(token.access_token, token.userId);

  // Dedupe to the most recent interval per date (occasional duplicates).
  const byDate = new Map<string, EightSleepDailyRow>();
  for (const iv of data.intervals ?? []) {
    const row = intervalToRow(iv);
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, row);
      continue;
    }
    // Prefer the one with a non-null score, then the higher score.
    const a = existing.sleep_score ?? -1;
    const b = row.sleep_score ?? -1;
    if (b > a) byDate.set(row.date, row);
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
