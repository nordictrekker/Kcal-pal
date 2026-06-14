// Oura API v2 client. Pure TS, no Supabase client — usable from both the
// Next.js server actions (Node) and the Supabase Edge Function (Deno).
//
// Pulls the four core endpoints (sleep, readiness, activity, sleep periods)
// plus three optional ones (spo2, stress, resilience) that some accounts /
// ring generations don't populate. Optional endpoints are wrapped so a 404
// or empty response never breaks the whole sync.

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";

type OuraEnvelope<T> = { data: T[]; next_token: string | null };

interface DailySleep {
  day: string;
  score: number | null;
}

interface DailyReadiness {
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
}

interface DailyActivity {
  day: string;
  score: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  target_calories: number | null;
  average_met_minutes: number | null;
}

interface SleepPeriod {
  day: string;
  type: string;
  average_hrv: number | null;
  lowest_heart_rate: number | null;
  average_heart_rate: number | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  efficiency: number | null;
  latency: number | null;
  restless_periods: number | null;
  average_breath: number | null;
}

interface DailySpo2 {
  day: string;
  spo2_percentage: { average: number | null } | null;
}

interface DailyStress {
  day: string;
  stress_high: number | null; // seconds
  recovery_high: number | null; // seconds
}

interface DailyResilience {
  day: string;
  level: string | null;
}

export interface OuraDailyRow {
  date: string;
  sleep_score: number | null;
  total_sleep_min: number | null;
  rem_sleep_min: number | null;
  deep_sleep_min: number | null;
  light_sleep_min: number | null;
  hrv_avg: number | null;
  resting_hr: number | null;
  average_hr_sleep: number | null;
  readiness_score: number | null;
  activity_score: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  target_calories: number | null;
  average_met: number | null;
  sleep_efficiency: number | null;
  sleep_latency_min: number | null;
  restless_periods: number | null;
  average_breath: number | null;
  temp_deviation: number | null;
  temp_trend_deviation: number | null;
  spo2_avg: number | null;
  stress_high_min: number | null;
  recovery_high_min: number | null;
  resilience_level: string | null;
  raw: Record<string, unknown>;
}

async function fetchOura<T>(
  endpoint: string,
  token: string,
  start_date: string,
  end_date: string,
): Promise<OuraEnvelope<T>> {
  const url = new URL(`${OURA_BASE}/${endpoint}`);
  url.searchParams.set("start_date", start_date);
  url.searchParams.set("end_date", end_date);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Oura /${endpoint} ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as OuraEnvelope<T>;
}

// Optional endpoints: never let a missing/forbidden one abort the sync.
async function fetchOuraOptional<T>(
  endpoint: string,
  token: string,
  start_date: string,
  end_date: string,
): Promise<T[]> {
  try {
    const env = await fetchOura<T>(endpoint, token, start_date, end_date);
    return env.data;
  } catch {
    return [];
  }
}

function dateRange(days: number): { start_date: string; end_date: string } {
  // Inclusive range ending today (UTC). Oura accepts ISO dates.
  const today = new Date();
  const end_date = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date };
}

const secToMin = (s: number | null | undefined): number | null =>
  typeof s === "number" ? Math.round(s / 60) : null;

// Pulls last N days from all endpoints and folds them into a single row per
// date. Idempotent — callers upsert on (user_id, date).
export async function fetchOuraDaily(
  token: string,
  days = 14,
): Promise<OuraDailyRow[]> {
  const { start_date, end_date } = dateRange(days);

  const [sleep, readiness, activity, sleepPeriods, spo2, stress, resilience] =
    await Promise.all([
      fetchOura<DailySleep>("daily_sleep", token, start_date, end_date),
      fetchOura<DailyReadiness>("daily_readiness", token, start_date, end_date),
      fetchOura<DailyActivity>("daily_activity", token, start_date, end_date),
      fetchOura<SleepPeriod>("sleep", token, start_date, end_date),
      fetchOuraOptional<DailySpo2>("daily_spo2", token, start_date, end_date),
      fetchOuraOptional<DailyStress>("daily_stress", token, start_date, end_date),
      fetchOuraOptional<DailyResilience>(
        "daily_resilience",
        token,
        start_date,
        end_date,
      ),
    ]);

  const byDate = new Map<string, OuraDailyRow>();

  const blank = (date: string): OuraDailyRow => ({
    date,
    sleep_score: null,
    total_sleep_min: null,
    rem_sleep_min: null,
    deep_sleep_min: null,
    light_sleep_min: null,
    hrv_avg: null,
    resting_hr: null,
    average_hr_sleep: null,
    readiness_score: null,
    activity_score: null,
    steps: null,
    active_calories: null,
    total_calories: null,
    target_calories: null,
    average_met: null,
    sleep_efficiency: null,
    sleep_latency_min: null,
    restless_periods: null,
    average_breath: null,
    temp_deviation: null,
    temp_trend_deviation: null,
    spo2_avg: null,
    stress_high_min: null,
    recovery_high_min: null,
    resilience_level: null,
    raw: {},
  });

  const get = (date: string): OuraDailyRow => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const row = blank(date);
    byDate.set(date, row);
    return row;
  };

  for (const d of sleep.data) {
    const row = get(d.day);
    row.sleep_score = d.score;
    row.raw.daily_sleep = d;
  }

  for (const d of readiness.data) {
    const row = get(d.day);
    row.readiness_score = d.score;
    row.temp_deviation = d.temperature_deviation;
    row.temp_trend_deviation = d.temperature_trend_deviation ?? null;
    row.raw.daily_readiness = d;
  }

  for (const d of activity.data) {
    const row = get(d.day);
    row.activity_score = d.score;
    row.steps = d.steps;
    row.active_calories = d.active_calories ?? null;
    row.total_calories = d.total_calories ?? null;
    row.target_calories = d.target_calories ?? null;
    row.average_met = d.average_met_minutes ?? null;
    row.raw.daily_activity = d;
  }

  // Multiple sleep periods per day are possible (naps). Take the "long_sleep"
  // type — the night's main sleep — for the daily HRV/RHR/architecture.
  const longSleep = new Map<string, SleepPeriod>();
  for (const p of sleepPeriods.data) {
    if (p.type === "long_sleep") longSleep.set(p.day, p);
  }

  for (const [day, p] of longSleep) {
    const row = get(day);
    row.hrv_avg = p.average_hrv;
    row.resting_hr = p.lowest_heart_rate;
    row.average_hr_sleep = p.average_heart_rate ?? null;
    row.total_sleep_min = secToMin(p.total_sleep_duration);
    row.rem_sleep_min = secToMin(p.rem_sleep_duration);
    row.deep_sleep_min = secToMin(p.deep_sleep_duration);
    row.light_sleep_min = secToMin(p.light_sleep_duration);
    row.sleep_efficiency = p.efficiency ?? null;
    row.sleep_latency_min = secToMin(p.latency);
    row.restless_periods = p.restless_periods ?? null;
    row.average_breath = p.average_breath ?? null;
    row.raw.sleep = p;
  }

  for (const d of spo2) {
    const row = get(d.day);
    row.spo2_avg = d.spo2_percentage?.average ?? null;
    row.raw.daily_spo2 = d;
  }

  for (const d of stress) {
    const row = get(d.day);
    row.stress_high_min = secToMin(d.stress_high);
    row.recovery_high_min = secToMin(d.recovery_high);
    row.raw.daily_stress = d;
  }

  for (const d of resilience) {
    const row = get(d.day);
    row.resilience_level = d.level ?? null;
    row.raw.daily_resilience = d;
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
