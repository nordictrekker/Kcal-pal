import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { configureWebPush, webpush } from "@/lib/push";
import { localDayKey, localDayBoundsUTC } from "@/lib/timezone";

// Lapse re-entry nudge (P0 #3, docs/product/feature-priorities.md): once a day,
// each push-subscribed user who has logged recently but has nothing logged for
// their local *today* gets ONE gentle reminder deep-linking to /log, where
// "Log again" makes the re-entry a single tap. Adherence-neutral wording — no
// streaks, no guilt. Runs on Vercel cron (schedule in vercel.json); the daily
// cadence itself caps it at one nudge per day.
export const dynamic = "force-dynamic";

// Only nudge people with a live habit: at least one entry in this window.
const ACTIVE_WINDOW_DAYS = 14;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !configureWebPush()) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }
  const supabase = createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  // Everyone with a push subscription, with their timezone.
  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("user_id,endpoint,p256dh,auth");
  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }
  const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id as string)));
  if (userIds.length === 0) return NextResponse.json({ nudged: 0 });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id,timezone")
    .in("user_id", userIds);
  const tzByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.timezone as string | null]),
  );

  let nudged = 0;
  const stale: string[] = [];
  for (const userId of userIds) {
    const tz = tzByUser.get(userId) ?? null;
    const today = localDayKey(tz);
    const { start: dayStart, end: dayEnd } = localDayBoundsUTC(tz, today);
    const activeSince = new Date(
      Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000,
    ).toISOString();

    // Skip if they already logged today, or haven't logged at all recently
    // (don't nag brand-new or long-gone accounts).
    const [{ count: todayCount }, { count: recentCount }] = await Promise.all([
      supabase
        .from("food_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("consumed_at", dayStart)
        .lt("consumed_at", dayEnd),
      supabase
        .from("food_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("consumed_at", activeSince),
    ]);
    if ((todayCount ?? 0) > 0 || (recentCount ?? 0) === 0) continue;

    const payload = JSON.stringify({
      title: "Quick log?",
      body: "Yesterday's meals are one tap away — Log again.",
      url: "/log",
    });
    for (const sub of (subs ?? []).filter((s) => s.user_id === userId)) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          payload,
        );
        nudged++;
      } catch (e: unknown) {
        // 404/410 = subscription expired — clean it up instead of retrying forever.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(sub.endpoint as string);
      }
    }
  }

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", stale);
  }
  return NextResponse.json({ nudged, cleaned: stale.length });
}
