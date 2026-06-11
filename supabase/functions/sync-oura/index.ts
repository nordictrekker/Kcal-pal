// Supabase Edge Function: sync-oura
// Pulls last 7 days from Oura into oura_daily for the single allowed user.
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
}
interface DailyActivity {
  day: string;
  score: number | null;
  steps: number | null;
}
interface SleepPeriod {
  day: string;
  type: string;
  average_hrv: number | null;
  lowest_heart_rate: number | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
}

interface OuraDailyRow {
  date: string;
  sleep_score: number | null;
  total_sleep_min: number | null;
  rem_sleep_min: number | null;
  deep_sleep_min: number | null;
  hrv_avg: number | null;
  resting_hr: number | null;
  readiness_score: number | null;
  activity_score: number | null;
  steps: number | null;
  temp_deviation: number | null;
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

function dateRange(days: number): { start_date: string; end_date: string } {
  const today = new Date();
  const end_date = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start_date: start.toISOString().slice(0, 10), end_date };
}

async function fetchOuraDaily(
  token: string,
  days = 7,
): Promise<OuraDailyRow[]> {
  const { start_date, end_date } = dateRange(days);

  const [sleep, readiness, activity, sleepPeriods] = await Promise.all([
    fetchOura<DailySleep>("daily_sleep", token, start_date, end_date),
    fetchOura<DailyReadiness>("daily_readiness", token, start_date, end_date),
    fetchOura<DailyActivity>("daily_activity", token, start_date, end_date),
    fetchOura<SleepPeriod>("sleep", token, start_date, end_date),
  ]);

  const byDate = new Map<string, OuraDailyRow>();
  const blank = (date: string): OuraDailyRow => ({
    date,
    sleep_score: null,
    total_sleep_min: null,
    rem_sleep_min: null,
    deep_sleep_min: null,
    hrv_avg: null,
    resting_hr: null,
    readiness_score: null,
    activity_score: null,
    steps: null,
    temp_deviation: null,
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
    row.raw.daily_readiness = d;
  }
  for (const d of activity.data) {
    const row = get(d.day);
    row.activity_score = d.score;
    row.steps = d.steps;
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
    if (typeof p.total_sleep_duration === "number") {
      row.total_sleep_min = Math.round(p.total_sleep_duration / 60);
    }
    if (typeof p.rem_sleep_duration === "number") {
      row.rem_sleep_min = Math.round(p.rem_sleep_duration / 60);
    }
    if (typeof p.deep_sleep_duration === "number") {
      row.deep_sleep_min = Math.round(p.deep_sleep_duration / 60);
    }
    row.raw.sleep = p;
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

Deno.serve(async () => {
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

    const rows = await fetchOuraDaily(ouraToken, 7);
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
