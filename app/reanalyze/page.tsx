import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getReanalyzeTargets } from "./actions";
import { ReanalyzePanel } from "./reanalyze-panel";

export const dynamic = "force-dynamic";

export default async function ReanalyzePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const targets = await getReanalyzeTargets();

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-24">
      <header className="space-y-1">
        <Link
          href="/today"
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft className="size-4" /> Today
        </Link>
        <h1 className="font-serif text-3xl font-medium leading-tight">
          Re-analyze logs
        </h1>
        <p className="text-xs text-muted-foreground">
          Refresh older entries with the latest per-component micronutrient
          breakdown.
        </p>
      </header>

      <ReanalyzePanel targets={targets} />
    </main>
  );
}
