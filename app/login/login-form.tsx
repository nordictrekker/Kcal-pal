"use client";

import { useFormStatus } from "react-dom";
import { sendMagicLink, verifyMagicLinkUrl } from "./actions";
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
      {pending ? "Sending…" : "Send sign-in link"}
    </Button>
  );
}

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Verifying…" : "Sign in"}
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
          {sent ? "Enter the code from your email." : "Sign in."}
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
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>1. Open the email from Supabase.</li>
              <li>2. Find the 6-digit sign-in code.</li>
              <li>3. Type it below and tap Sign in.</li>
            </ol>
            <form action={verifyMagicLinkUrl} className="space-y-4">
              <input type="hidden" name="email" value={email ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  name="code"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <VerifyButton />
            </form>
            <p className="text-xs text-muted-foreground">
              Sent to <span className="font-medium">{email}</span>. The code
              expires in about an hour.
            </p>
            <form action={sendMagicLink}>
              <input type="hidden" name="email" value={email ?? ""} />
              <button
                type="submit"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Re-send link
              </button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
