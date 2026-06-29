"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { Bug } from "lucide-react";
import { submitBugReport, type BugReportState } from "./bug-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: BugReportState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending…" : "Send report"}
    </Button>
  );
}

// A small "report a bug" form. Captures the current page + user agent so a
// reviewer has context; the body is whatever the user types.
export function FeedbackCard() {
  const [state, action] = useActionState(submitBugReport, initial);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Bug className="size-4 text-muted-foreground" /> Report a bug
        </h2>
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Report
          </Button>
        ) : null}
      </div>

      {open ? (
        <form ref={formRef} action={action} className="space-y-2">
          <input type="hidden" name="context" value={pathname ?? ""} />
          <Label htmlFor="bug-message" className="sr-only">
            Describe the issue
          </Label>
          <Textarea
            id="bug-message"
            name="message"
            rows={3}
            required
            maxLength={2000}
            placeholder="What went wrong, or what felt off? Include what you expected to happen."
            className="text-sm"
          />
          {state.error ? (
            <p className="text-xs text-destructive">{state.error}</p>
          ) : null}
          {state.ok ? (
            <p className="text-xs text-[var(--macro-fiber)]">
              Thanks — your report was sent.
            </p>
          ) : null}
          <div className="flex gap-2">
            <SubmitButton />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Spot something wrong or confusing? Tell us and we&apos;ll look into it.
        </p>
      )}
    </section>
  );
}
