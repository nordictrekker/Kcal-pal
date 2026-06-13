import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { InstallCard } from "./install-card";
import { Notifications } from "./notifications";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <InstallCard />

      {vapidPublicKey ? (
        <Notifications vapidPublicKey={vapidPublicKey} />
      ) : (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Push notifications aren&apos;t configured (VAPID keys missing on the
          server).
        </p>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Signed in as {user.email}.
      </p>
    </main>
  );
}
