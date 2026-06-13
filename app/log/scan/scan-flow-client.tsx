"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// html5-qrcode bundles browser-only globals at module level. Forcing
// ssr: false here keeps Next from touching the module during server
// rendering and avoids "client-side exception while loading" crashes
// on iOS Safari.
const ScanFlow = dynamic(
  () => import("./scan-flow").then((m) => ({ default: m.ScanFlow })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading scanner…
      </div>
    ),
  },
);

export function ScanFlowClient() {
  return <ScanFlow />;
}
