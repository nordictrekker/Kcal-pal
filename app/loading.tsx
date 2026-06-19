import { Loader2 } from "lucide-react";

// Instant navigation feedback: shown immediately while a dynamic route renders
// on the server, so moving between pages never lands on a blank screen.
export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
