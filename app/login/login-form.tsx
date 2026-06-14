"use client";

import { useFormStatus } from "react-dom";
import { sendMagicLink, verifyMagicLinkUrl } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
          {sent ? "Paste the sign-in link from your email." : "Sign in."}
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
              <li>
                2. <span className="font-medium">Long-press</span> the
                sign-in link → <span className="font-medium">Copy Link</span>.
              </li>
              <li>3. Paste it below and tap Sign in.</li>
            </ol>
            <form action={verifyMagicLinkUrl} className="space-y-4">
              <input type="hidden" name="email" value={email ?? ""} />
              <div className="space-y-2">
                <Label htmlFor="url">Sign-in link</Label>
                <Textarea
                  id="url"
                  name="url"
                  required
                  autoFocus
                  rows={3}
                  placeholder="https://…supabase.co/auth/v1/verify?token=…"
                  className="font-mono text-xs"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <VerifyButton />
            </form>
            <p className="text-xs text-muted-foreground">
              Sent to <span className="font-medium">{email}</span>. On a
              desktop browser you can just click the link in the email
              instead.
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
