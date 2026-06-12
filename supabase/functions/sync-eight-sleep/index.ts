// Supabase Edge Function: sync-eight-sleep
// Pulls recent Eight Sleep intervals into eight_sleep_daily for the single
// allowed user. Eight Sleep has no public API; this replicates the auth
// flow used by pyEight. May break if Eight Sleep rotates credentials.
//
// Env:
//   EIGHT_SLEEP_EMAIL
//   EIGHT_SLEEP_PASSWORD
//   ALLOWED_EMAIL
// Auto-injected:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const AUTH_URL = "https://auth-api.8slp.net/v1/tokens";
const API_BASE = "https://client-api.8slp.net/v1";
const CLIENT_ID = "0894c7f33bb94800a03f1f4df13a4f38";
const CLIENT_SECRET =
  "f0954a3ed5763ba3d06834c73731a32f15f168f47d4f164751275def86db0c76";

type TimeSeries = Array<[string, number]>;

interface Interval {
  id: string;
  ts: string;
  score: number | null;
  stages?: Array<{ stage: string; duration: number }>;
  timeseries?: {
    tnt?: TimeSeries;
    tempBedC?: TimeSeries;
    heartRate?: TimeSeries;
    hrv?: TimeSeries;
  };
}

interface EightSleepRow {
  date: string;
  sleep_score: number | null;
  total_sleep_min: number | null;
  hrv_avg: number | null;
  resting_hr: number | null;
  bed_temp_avg_f: number | null;
  toss_turns: number | null;
  raw: Record<string, unknown>;
}

async function login(email: string, password: string) {
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
    throw new Error(`Eight Sleep auth ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as {
    access_token: string;
    userId: string;
  };
}

async function getIntervals(token: string, userId: string) {
  const res = await fetch(`${API_BASE}/users/${userId}/intervals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Eight Sleep intervals ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as { intervals: Interval[] };
}

const avg = (ts?: TimeSeries) =>
  !ts || ts.length === 0 ? null : ts.reduce((a, [, v]) => a + v, 0) / ts.length;
const sum = (ts?: TimeSeries) =>
  !ts || ts.length === 0 ? null : ts.reduce((a, [, v]) => a + v, 0);
const minNum = (ts?: TimeSeries) => {
  if (!ts || ts.length === 0) return null;
  let m = Infinity;
  for (const [, v] of ts) if (v < m) m = v;
  return Number.isFinite(m) ? m : null;
};
const cToF = (c: number | null) => (c === null ? null : (c * 9) / 5 + 32);

function intervalToRow(iv: Interval): EightSleepRow {
  const ts = iv.timeseries ?? {};
  const totalSleepSec = (iv.stages ?? [])
    .filter((s) => s.stage !== "awake" && s.stage !== "out")
    .reduce((a, s) => a + (s.duration ?? 0), 0);
  return {
    date: new Date(iv.ts).toISOString().slice(0, 10),
    sleep_score: typeof iv.score === "number" ? Math.round(iv.score) : null,
    total_sleep_min: totalSleepSec > 0 ? Math.round(totalSleepSec / 60) : null,
    hrv_avg: avg(ts.hrv),
    resting_hr: minNum(ts.heartRate) ? Math.round(minNum(ts.heartRate)!) : null,
    bed_temp_avg_f: cToF(avg(ts.tempBedC)),
    toss_turns: sum(ts.tnt) ? Math.round(sum(ts.tnt)!) : null,
    raw: iv as unknown as Record<string, unknown>,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async () => {
  try {
    const email = Deno.env.get("EIGHT_SLEEP_EMAIL");
    const password = Deno.env.get("EIGHT_SLEEP_PASSWORD");
    const allowedEmail = Deno.env.get("ALLOWED_EMAIL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!email || !password || !allowedEmail || !supabaseUrl || !serviceKey) {
      return jsonResponse(
        {
          error:
            "Missing config. Required: EIGHT_SLEEP_EMAIL, EIGHT_SLEEP_PASSWORD, ALLOWED_EMAIL.",
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
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

    const token = await login(email, password);
    const data = await getIntervals(token.access_token, token.userId);

    const byDate = new Map<string, EightSleepRow>();
    for (const iv of data.intervals ?? []) {
      const row = intervalToRow(iv);
      const existing = byDate.get(row.date);
      if (!existing) {
        byDate.set(row.date, row);
        continue;
      }
      const a = existing.sleep_score ?? -1;
      const b = row.sleep_score ?? -1;
      if (b > a) byDate.set(row.date, row);
    }

    const rows = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (rows.length === 0) {
      return jsonResponse({ ok: true, days_synced: 0 });
    }
    const withUser = rows.map((r) => ({ ...r, user_id: user.id }));

    const { error: upsertErr } = await supabase
      .from("eight_sleep_daily")
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
