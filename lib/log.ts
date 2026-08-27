// Structured logging for failures we deliberately don't propagate (best-effort
// cache writes, usage counters, optional third-party lookups). Swallowing them
// silently means a broken integration looks identical to a healthy one in the
// Vercel logs, so every non-fatal catch/ignored error routes through here.

type Context = Record<string, unknown>;

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { message?: unknown }).message === "string" &&
    (err as { message: string }).message
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}

// `scope` identifies the call site (e.g. "fdc.cacheWrite") so log lines can be
// grepped and alerted on.
export function logError(scope: string, err: unknown, context?: Context): void {
  const detail = err instanceof Error ? err : errorMessage(err, "Unknown error");
  if (context && Object.keys(context).length > 0) {
    console.error(`[kcal-pal] ${scope}:`, detail, context);
  } else {
    console.error(`[kcal-pal] ${scope}:`, detail);
  }
}

// Postgrest errors arrive as a value, not a throw — easy to destructure away.
export function logQueryError(
  scope: string,
  error: { message: string; code?: string; details?: string } | null,
  context?: Context,
): void {
  if (!error) return;
  logError(scope, error, { ...context, code: error.code });
}
