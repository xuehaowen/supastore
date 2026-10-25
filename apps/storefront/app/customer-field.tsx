"use client";

import { useId, type ComponentProps } from "react";
import { Label } from "@supastore/ui/label";
import { CustomerInput } from "./customer-form";

export function CustomerField({
  label,
  value,
  required = true,
  ...props
}: Omit<ComponentProps<typeof CustomerInput>, "value"> & {
  label: string;
  value?: string | number | undefined;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <CustomerInput
        {...props}
        id={id}
        defaultValue={value}
        required={required}
      />
    </div>
  );
}
