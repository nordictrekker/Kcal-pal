"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import {
  saveSubscription,
  removeSubscription,
  sendTestPush,
} from "./push-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export function Notifications({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    setMsg(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
        });
        const json = sub.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        const r = await saveSubscription(json);
        if (!r.ok) {
          setMsg(r.error ?? "Failed to save subscription.");
          return;
        }
        setState("on");
        setMsg("Notifications enabled.");
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Subscription failed.");
      }
    });
  }

  function disable() {
    setMsg(null);
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications disabled.");
    });
  }

  function test() {
    setMsg(null);
    start(async () => {
      const r = await sendTestPush();
      setMsg(r.ok ? "Test sent — check for the banner." : (r.error ?? "Failed."));
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          {state === "on" ? (
            <Bell className="size-4 text-muted-foreground" />
          ) : (
            <BellOff className="size-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Notifications</span>
        </div>

        <p className="text-sm text-muted-foreground">
          One push per quarter reminding you to re-export Apple Health.
        </p>

        {state === "unsupported" ? (
          <p className="text-sm text-muted-foreground">
            Push isn&apos;t available here. On iPhone, add the app to your home
            screen first (Share → Add to Home Screen), then open it from there.
          </p>
        ) : null}

        {state === "denied" ? (
          <p className="text-sm text-destructive">
            Notifications are blocked. Enable them in iOS Settings →
            Notifications → kcal pal.
          </p>
        ) : null}

        {state === "off" ? (
          <Button onClick={enable} disabled={pending} className="w-full">
            <Bell className="mr-2 size-4" /> Enable notifications
          </Button>
        ) : null}

        {state === "on" ? (
          <div className="flex gap-2">
            <Button onClick={test} variant="outline" disabled={pending} className="flex-1">
              <Send className="mr-2 size-4" /> Send test
            </Button>
            <Button onClick={disable} variant="ghost" disabled={pending}>
              Disable
            </Button>
          </div>
        ) : null}

        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
