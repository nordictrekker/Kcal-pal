"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion, X } from "lucide-react";
import { submitBugReport, type BugReportState } from "@/app/settings/bug-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initial: BugReportState = { ok: false };

// Auth screens have no chrome to overlay.
const HIDDEN_PREFIXES = ["/login", "/auth"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Send"}
    </Button>
  );
}

// A small always-present floating button for reporting bugs / issues. Captures
// the page it was opened on + the user agent (see the server action). Intended
// to grow into a general help button.
export function FeedbackButton() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [state, action] = useActionState(submitBugReport, initial);

  // Depend on the whole state object so a second successful submit re-triggers.
  useEffect(() => {
    if (state.ok) setSent(true);
  }, [state]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  function openDialog() {
    setSent(false);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Report a bug or get help"
        className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
      >
        <MessageCircleQuestion className="size-5" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Report a bug"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-xl border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Report a bug</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {sent ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Thanks — your report was sent. We&apos;ll look into it.
                </p>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form action={action} className="space-y-2">
                <input type="hidden" name="context" value={pathname} />
                <Textarea
                  name="message"
                  rows={3}
                  required
                  maxLength={2000}
                  autoFocus
                  placeholder="What went wrong, or what felt off? Include what you expected to happen."
                  className="text-sm"
                />
                {state.error ? (
                  <p className="text-xs text-destructive">{state.error}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <SubmitButton />
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
