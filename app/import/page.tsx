import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imports } = await supabase
    .from("apple_health_imports")
    .select("imported_at,date_range_start,date_range_end,records_imported,file_name")
    .eq("user_id", user.id)
    .order("imported_at", { ascending: false })
    .limit(5);

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Apple Health</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>

      <ImportForm />

      {imports && imports.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent imports
          </h2>
          <div className="divide-y rounded-lg border text-sm">
            {imports.map((im, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {(im.file_name as string) ?? "Import"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(im.date_range_start as string) ?? "?"} –{" "}
                    {(im.date_range_end as string) ?? "?"}
                  </p>
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {(im.records_imported as number) ?? 0}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
