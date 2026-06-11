import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera } from "lucide-react";
import { defaultMeal } from "@/lib/food";
import { LogForm } from "./log-form";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Log food</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <Link
        href="/log/scan"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md border bg-secondary font-medium text-secondary-foreground hover:bg-secondary/80"
      >
        <Camera className="size-4" />
        Scan barcode
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          or type it
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <LogForm defaultMeal={defaultMeal()} />
    </main>
  );
}
