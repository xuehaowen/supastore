"use client";

import { useId, useState } from "react";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";
import { decimalToMinor, minorToDecimal } from "@/domain/money/decimal-input";
import { useWorkspace } from "./workspace-context";

export function CurrencyField({
  label,
  name,
  value,
  required = true,
  currency,
  precision,
  signed = false,
}: {
  label: string;
  name: string;
  value?: string | number;
  required?: boolean;
  currency?: string;
  precision?: number;
  signed?: boolean;
}) {
  const workspace = useWorkspace();
  const digits = precision ?? workspace.precision;
  const code = currency ?? workspace.currency;
  const id = useId();
  const [amount, setAmount] = useState(
    value === undefined || value === ""
      ? ""
      : minorToDecimal(Number(value), digits),
  );
  const minor = decimalToMinor(amount, digits, signed);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label} ({code})
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={signed ? undefined : 0}
        step={10 ** -digits}
        required={required}
        value={amount}
        onChange={(event) => {
          const next = event.target.value;
          setAmount(next);
          event.target.setCustomValidity(
            next && decimalToMinor(next, digits, signed) === null
              ? `Enter an amount with at most ${digits} decimal places.`
              : "",
          );
        }}
      />
      <input type="hidden" name={name} value={minor ?? ""} />
    </div>
  );
}
