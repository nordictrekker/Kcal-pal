"use client";

import { useFormStatus } from "react-dom";
import { sendMagicLink } from "./actions";
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending..." : "Send magic link"}
    </Button>
  );
}

export function LoginForm({
  error,
  sent,
}: {
  error?: string;
  sent?: boolean;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Kcal-pal</CardTitle>
        <CardDescription>Sign in with a magic link.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm">
            Check your email for a sign-in link.
          </p>
        ) : (
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
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <SubmitButton />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
