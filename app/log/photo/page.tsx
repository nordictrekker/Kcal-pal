import { requireUserOrRedirect } from "@/lib/actions";
import Link from "next/link";
import { PhotoFlow } from "./photo-flow";

export const dynamic = "force-dynamic";

export default async function PhotoPage() {
  await requireUserOrRedirect();

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Photo log</h1>
        <Link
          href="/today"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Today →
        </Link>
      </header>
      <PhotoFlow />
    </main>
  );
}
