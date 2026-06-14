"use client";

import { useFormStatus } from "react-dom";
import { sendMagicLink, verifyOtpCode } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send code"}
    </Button>
  );
}

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Verifying…" : "Verify"}
    </Button>
  );
}

export function LoginForm({
  error,
  sent,
  email,
}: {
  error?: string;
  sent?: boolean;
  email?: string;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Kcal-pal</CardTitle>
        <CardDescription>
          {sent
            ? "Enter the 6-digit code from your email."
            : "Sign in with a 6-digit code."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!sent ? (
          <form action={sendMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                inputMode="email"
                defaultValue={email}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <SendButton />
          </form>
        ) : (
          <>
            <form action={verifyOtpCode} className="space-y-4">
              <input type="hidden" name="email" value={email ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="token">Code</Label>
                <Input
                  id="token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  placeholder="123456"
                  className="text-center text-2xl tracking-widest tabular-nums"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <VerifyButton />
            </form>
            <p className="text-xs text-muted-foreground">
              Sent to <span className="font-medium">{email}</span>. On
              desktop you can also click the link in the email. On
              iPhone (installed app), use the code — clicking the link
              opens Safari outside the app.
            </p>
            <form action={sendMagicLink}>
              <input type="hidden" name="email" value={email ?? ""} />
              <button
                type="submit"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Re-send code
              </button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
