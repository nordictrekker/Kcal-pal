"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Route-level error boundary. Turns an uncaught client exception into a
// recoverable screen instead of the raw "Application error" white page.
// A ChunkLoadError means a new version shipped while an old page was open
// (the cached HTML references a chunk hash that no longer exists) — reload
// once to pick up the new build.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk|dynamically imported module|importing a module script failed/i.test(
      error?.message ?? "",
    );

  useEffect(() => {
    if (!isChunkError || typeof window === "undefined") return;
    // Guard against reload loops.
    const KEY = "kcal_chunk_reload_at";
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  }, [isChunkError]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-serif text-2xl font-medium">
        {isChunkError ? "Updating to the latest version…" : "Something went wrong"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {isChunkError
          ? "A new version just shipped. Reloading to pick it up."
          : "That screen hit an error. You can try again or head back to Today."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/today">Back to Today</Link>
        </Button>
      </div>
    </main>
  );
}
