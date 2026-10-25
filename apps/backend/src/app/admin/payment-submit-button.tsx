"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@supastore/ui/button";

export function PaymentSubmitButton({
  children,
  disabled = false,
  variant = "default",
}: {
  children: string;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={disabled || pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}
