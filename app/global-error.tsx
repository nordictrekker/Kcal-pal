"use client";

import { useEffect } from "react";

// Last-resort boundary for errors thrown in the root layout itself. Must
// render its own <html>/<body>. Kept dependency-free with inline styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk|dynamically imported module/i.test(
      error?.message ?? "",
    );

  useEffect(() => {
    if (isChunkError && typeof window !== "undefined") {
      const KEY = "kcal_chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#f7f3ec",
          color: "#211c1a",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#6b6258", margin: 0, fontSize: "0.9rem" }}>
          Try again, or reload the app.
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "none",
              background: "#4e7f58",
              color: "white",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "1px solid #d6ccbf",
              background: "transparent",
              color: "#211c1a",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
