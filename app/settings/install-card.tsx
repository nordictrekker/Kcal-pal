"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function InstallCard() {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setInstalled(standalone);
  }, []);

  if (installed) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Installed to your home screen. 🎉
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm font-medium">Install to home screen</p>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Share className="mt-0.5 size-4 shrink-0" />
            <span>Tap the Share button in Safari&apos;s toolbar.</span>
          </li>
          <li className="flex items-start gap-2">
            <SquarePlus className="mt-0.5 size-4 shrink-0" />
            <span>
              Choose <span className="font-medium">Add to Home Screen</span>,
              then Add.
            </span>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Installing is required for notifications to work on iOS, and makes the
          app open full-screen.
        </p>
      </CardContent>
    </Card>
  );
}
