"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@supastore/ui/button";
import { textFor } from "@supastore/i18n/messages";

export function CustomerSubmit({
  locale,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { locale: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? textFor(locale).common.wait : children}
    </Button>
  );
}
