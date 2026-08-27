// Shared plumbing for server actions: the auth preamble every action repeats,
// the result shape they all return, and the revalidate + "undo my last log"
// helpers. Server-only (imports next/cache and the cookie-backed client).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayBounds } from "@/lib/food";

// The result shape every mutating action returns to a form/`useActionState`.
export type ActionResult = { ok: boolean; error?: string };

export const NOT_SIGNED_IN = "Not signed in.";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthUser = NonNullable<
  Awaited<ReturnType<ServerClient["auth"]["getUser"]>>["data"]["user"]
>;

export type AuthedContext = {
  ok: true;
  supabase: ServerClient;
  user: AuthUser;
};

// Cookie-backed client plus the signed-in user. The failure branch is itself a
// valid `ActionResult`, so callers can `if (!auth.ok) return auth;`.
export async function requireUser(): Promise<
  AuthedContext | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: NOT_SIGNED_IN };
  return { ok: true, supabase, user };
}

// Page variant: every authed page opens with this and sends guests to /login.
export async function requireUserOrRedirect(): Promise<AuthedContext> {
  const auth = await requireUser();
  if (!auth.ok) redirect("/login");
  return auth;
}

export function revalidatePaths(...paths: string[]): void {
  for (const path of paths) revalidatePath(path);
}

// Delete the most recent row this user logged today from a `logged_at` table —
// the shared body of the water/alcohol undo buttons.
export async function undoLastLogToday(
  supabase: ServerClient,
  table: string,
  userId: string,
): Promise<ActionResult> {
  const { start } = dayBounds();

  const { data: latest } = await supabase
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .gte("logged_at", start)
    .order("logged_at", { ascending: false })
    .limit(1);

  const id = latest?.[0]?.id;
  if (!id) return { ok: false, error: "Nothing to undo today." };

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
