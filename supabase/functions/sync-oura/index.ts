// Supabase Edge Function: sync-oura
// Pulls last 14 days from Oura into oura_daily for the single allowed user.
// Triggered nightly by pg_cron (see supabase/migrations/0002_oura_cron.sql)
// and manually by the "Sync now" button on /today.
//
// Env (set via `supabase secrets set` or dashboard):
//   OURA_PERSONAL_ACCESS_TOKEN
//   ALLOWED_EMAIL
// Auto-injected by Supabase runtime:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

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
  stress_high: number | null;
  recovery_high: number | null;
}
interface DailyResilience {
  day: string;
  level: string | null;
}

interface OuraDailyRow {
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

async function fetchOuraOptional<T>(
  endpoint: string,
  token: string,
  start_date: string,
  end_date: string,
): Promise<T[]> {
  try {
    const env = await fetchOura<T>(endpoint, token, start_date, end_date);
    return env.data;
  } catch (err) {
    // Optional endpoints (workouts, tags, …) vary by subscription — a miss must
    // not abort the sync, but it should show up in the function logs.
    console.error(`[sync-oura] optional endpoint ${endpoint} failed:`, err);
    return [];
  }
}

function dateRange(days: number): { start_date: string; end_date: string } {
  const today = new Date();
  const end_date = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date };
}

const secToMin = (s: number | null | undefined): number | null =>
  typeof s === "number" ? Math.round(s / 60) : null;

async function fetchOuraDaily(
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
    let row = byDate.get(date);
    if (!row) {
      row = blank(date);
      byDate.set(date, row);
    }
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const ouraToken = Deno.env.get("OURA_PERSONAL_ACCESS_TOKEN");
    const allowedEmail = Deno.env.get("ALLOWED_EMAIL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ouraToken || !allowedEmail || !supabaseUrl || !serviceKey) {
      return jsonResponse(
        {
          error:
            "Missing config. Required secrets: OURA_PERSONAL_ACCESS_TOKEN, ALLOWED_EMAIL. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.",
        },
        500,
      );
    }

    // Internal auth: caller must present the project's secret key.
    // We disable Verify JWT on this function (sb_secret_* isn't a JWT)
    // and do the check here instead.
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${serviceKey}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Single-user app: resolve user_id by email.
    const { data: usersPage, error: listErr } =
      await supabase.auth.admin.listUsers({ perPage: 200 });
    if (listErr) {
      return jsonResponse({ error: `List users: ${listErr.message}` }, 500);
    }
    const user = usersPage.users.find(
      (u) => u.email?.toLowerCase() === allowedEmail.toLowerCase(),
    );
    if (!user) {
      return jsonResponse(
        { error: `No user matching ALLOWED_EMAIL=${allowedEmail}` },
        404,
      );
    }

    const rows = await fetchOuraDaily(ouraToken, 14);
    const withUser = rows.map((r) => ({ ...r, user_id: user.id }));

    const { error: upsertErr } = await supabase
      .from("oura_daily")
      .upsert(withUser, { onConflict: "user_id,date" });

    if (upsertErr) {
      return jsonResponse({ error: `Upsert: ${upsertErr.message}` }, 500);
    }

    return jsonResponse({ ok: true, days_synced: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
