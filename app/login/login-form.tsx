"use client";

import { sendMagicLink, verifyMagicLinkUrl } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
        <CardTitle>kcal pal</CardTitle>
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
            <SubmitButton className="w-full" pendingLabel="Sending…">
              Send sign-in link
            </SubmitButton>
          </form>
        ) : (
          <>
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>1. Open the email from Supabase.</li>
              <li>2. Find the sign-in code.</li>
              <li>3. Type it below and tap Sign in.</li>
            </ol>
            <form action={verifyMagicLinkUrl} className="space-y-4">
              <input type="hidden" name="email" value={email ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="code">Sign-in code</Label>
                <Input
                  id="code"
                  name="code"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder="12345678"
                  className="text-center font-mono text-lg tracking-[0.3em]"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <SubmitButton className="w-full" pendingLabel="Verifying…">
                Sign in
              </SubmitButton>
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
