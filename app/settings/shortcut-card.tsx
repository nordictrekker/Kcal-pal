"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <button
        type="button"
        onClick={copy}
        className="flex w-full items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-left text-xs hover:bg-muted/60"
      >
        <span className="flex-1 truncate font-mono">{value}</span>
        {copied ? (
          <Check className="size-3.5 shrink-0 text-green-600" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export function ShortcutCard({
  ingestUrl,
  token,
}: {
  ingestUrl: string;
  token: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div>
          <p className="text-sm font-medium">Apple Health auto-push</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Copy these into your Shortcut (see SETUP.md for the build steps).
            Tap to copy.
          </p>
        </div>
        <CopyRow label="POST URL" value={ingestUrl} />
        <CopyRow label="Authorization header" value={`Bearer ${token}`} />
        <p className="text-xs text-muted-foreground">
          Anyone with this token can write health data. If it leaks, change{" "}
          <span className="font-mono">HEALTH_INGEST_TOKEN</span> in Vercel and
          redeploy.
        </p>
      </CardContent>
    </Card>
  );
}
