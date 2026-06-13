"use client";

import { useEffect } from "react";

// Registers the service worker once on mount. Required for web-push and
// for iOS to treat the app as installable to the home screen.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal; push just won't be available.
    });
  }, []);

  return null;
}
