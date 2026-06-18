// Supabase Edge Function: send-quarterly-push
// Sends "Time to re-export Apple Health" to all of the allowed user's
// push subscriptions. Triggered by pg_cron on the first day of each
// quarter at 9am (see 0004_quarterly_push_cron.sql).
//
// Env:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT
//   ALLOWED_EMAIL
// Auto-injected:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY (override with a custom secret holding
//   the sb_secret_* key if legacy JWT keys are disabled)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:placeholder@example.com";
    const allowedEmail = Deno.env.get("ALLOWED_EMAIL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      !vapidPublic ||
      !vapidPrivate ||
      !allowedEmail ||
      !supabaseUrl ||
      !serviceKey
    ) {
      return jsonResponse(
        {
          error:
            "Missing config. Required: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ALLOWED_EMAIL.",
        },
        500,
      );
    }

    // Internal auth: caller must present the project's secret key.
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${serviceKey}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

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

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", user.id);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!subs || subs.length === 0) {
      return jsonResponse({ ok: true, sent: 0, note: "no subscriptions" });
    }

    const payload = JSON.stringify({
      title: "kcal pal",
      body: "Time to re-export Apple Health",
      url: "/import",
    });

    let sent = 0;
    const stale: string[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) stale.push(s.endpoint as string);
      }
    }

    if (stale.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .in("endpoint", stale);
    }

    return jsonResponse({ ok: true, sent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
