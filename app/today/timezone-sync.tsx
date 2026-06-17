"use client";

import { useEffect, useRef } from "react";
import { reportTimezone } from "./timezone-actions";

// Silently reports the phone's timezone when it differs from what's stored
// (first visit, or after travel). Renders nothing.
export function TimezoneSync({ storedTz }: { storedTz: string | null }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== storedTz) {
      void reportTimezone(tz);
    }
  }, [storedTz]);
  return null;
}
