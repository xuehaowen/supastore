"use client";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { textFor } from "@/i18n/messages";
export function CheckoutCredit({
  availableCents,
  purchaseCents,
  currency,
  precision,
  locale,
  defaultAmount = "0",
}: {
  availableCents: number;
  purchaseCents: number;
  currency: string;
  precision: number;
  locale: string;
  defaultAmount?: string;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const m = textFor(locale).checkoutDetails;
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  const digits =
    decimal && (decimal[2]?.length || 0) <= precision
      ? decimal[1]! + (decimal[2] || "").padEnd(precision, "0")
      : null;
  const minor = digits === null ? -1 : Number(digits);
  const maximum = Math.min(availableCents, purchaseCents);
  const valid = minor >= 0 && minor <= maximum && Number.isSafeInteger(minor);
  const format = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(cents / 10 ** precision);
  return (
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend>{m.credit}</legend>
      <p>
        {m.available}: {format(availableCents)}
      </p>
      <Label>
        {m.creditToApply}
        <Input
          name="creditAmount"
          type="number"
          min="0"
          max={maximum / 10 ** precision}
          step={1 / 10 ** precision}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Label>
      <input
        type="hidden"
        name="creditAppliedCents"
        value={valid ? minor : -1}
      />
      <p role="status" aria-live="polite">
        {valid
          ? `${m.creditApplied}: ${format(minor)} · ${m.externalPayment}: ${format(purchaseCents - minor)}`
          : m.creditError}
      </p>
      <p className="text-sm text-muted-foreground">{m.creditNotice}</p>
    </fieldset>
  );
}
