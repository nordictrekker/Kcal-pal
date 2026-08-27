"use server";

import { createClient } from "@/lib/supabase/server";
import { configureWebPush, webpush } from "@/lib/push";
import { errorMessage, logError, logQueryError } from "@/lib/log";

type SubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type ActionResult = { ok: boolean; error?: string };

export async function saveSubscription(
  sub: SubscriptionJson,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { ok: false, error: "Invalid subscription." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeSubscription(
  endpoint: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult> {
  if (!configureWebPush()) {
    return {
      ok: false,
      error: "VAPID keys not configured on the server.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  if (!subs || subs.length === 0) {
    return { ok: false, error: "No subscriptions — enable notifications first." };
  }

  const payload = JSON.stringify({
    title: "kcal pal",
    body: "Test notification — push is working.",
    url: "/today",
  });

  let sent = 0;
  const stale: string[] = [];
  let lastFailure: string | null = null;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint as string,
          keys: { p256dh: s.p256dh as string, auth: s.auth as string },
        },
        payload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode =
        typeof err === "object" && err !== null && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      lastFailure = errorMessage(err, `push failed (${statusCode ?? "no status"})`);
      // 404/410 mean the subscription is dead — prune it.
      if (statusCode === 404 || statusCode === 410) {
        stale.push(s.endpoint as string);
      } else {
        logError("push.sendTest", err, { statusCode });
      }
    }
  }

  if (stale.length > 0) {
    const { error: pruneErr } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .in("endpoint", stale);
    // Leftover dead rows only mean wasted sends next time.
    logQueryError("push.pruneStale", pruneErr, { count: stale.length });
  }

  if (sent === 0) {
    return {
      ok: false,
      error: lastFailure
        ? `Could not deliver to any subscription: ${lastFailure}`
        : "Could not deliver to any subscription.",
    };
  }
  return { ok: true };
}
