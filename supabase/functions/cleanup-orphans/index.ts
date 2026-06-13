// Supabase Edge Function: cleanup-orphans
// Deletes food-photos storage objects older than 24h that are not
// referenced by any food_entries.photo_url. The photo flow uploads
// before the confirm step, so cancelling leaves orphans; this reclaims
// that space. Triggered daily by pg_cron (0005_cleanup_cron.sql).
//
// Env: ALLOWED_EMAIL
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (override with a
//   custom secret holding the sb_secret_* key).

import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const BUCKET = "food-photos";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const allowedEmail = Deno.env.get("ALLOWED_EMAIL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!allowedEmail || !supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing config (ALLOWED_EMAIL)." }, 500);
    }

    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${serviceKey}`) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: usersPage, error: listErr } =
      await supabase.auth.admin.listUsers({ perPage: 200 });
    if (listErr) return jsonResponse({ error: listErr.message }, 500);
    const user = usersPage.users.find(
      (u) => u.email?.toLowerCase() === allowedEmail.toLowerCase(),
    );
    if (!user) return jsonResponse({ error: "User not found" }, 404);

    // Referenced photo paths (photo_url stores the storage path).
    const { data: entries, error: entErr } = await supabase
      .from("food_entries")
      .select("photo_url")
      .eq("user_id", user.id)
      .eq("source", "photo")
      .not("photo_url", "is", null);
    if (entErr) return jsonResponse({ error: entErr.message }, 500);
    const referenced = new Set(
      (entries ?? []).map((e) => e.photo_url as string),
    );

    // List the user's folder in the bucket (paginated).
    const now = Date.now();
    const toDelete: string[] = [];
    let offset = 0;
    const PAGE = 100;
    for (;;) {
      const { data: objects, error: lsErr } = await supabase.storage
        .from(BUCKET)
        .list(user.id, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (lsErr) return jsonResponse({ error: lsErr.message }, 500);
      if (!objects || objects.length === 0) break;

      for (const obj of objects) {
        const path = `${user.id}/${obj.name}`;
        const created = obj.created_at ? Date.parse(obj.created_at) : now;
        const age = now - created;
        if (age > MAX_AGE_MS && !referenced.has(path)) {
          toDelete.push(path);
        }
      }
      if (objects.length < PAGE) break;
      offset += PAGE;
    }

    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 100) {
      const slice = toDelete.slice(i, i + 100);
      const { error: rmErr } = await supabase.storage
        .from(BUCKET)
        .remove(slice);
      if (!rmErr) deleted += slice.length;
    }

    return jsonResponse({ ok: true, deleted, scanned: referenced.size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
