"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export type SubmitButtonProps = Omit<ButtonProps, "type" | "children"> & {
  children: React.ReactNode;
  // Label while the enclosing form's action is in flight ("Saving…").
  pendingLabel: React.ReactNode;
};

// A form's submit button that disables itself and swaps its label while the
// server action runs. `useFormStatus` only reads the nearest enclosing form, so
// this must stay a separate component from the form itself.
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
