"use client";

import type { ProductDetail } from "@supastore/contracts";
import { RadioGroup, RadioGroupItem } from "@supastore/ui/radio-group";
import { Label } from "@supastore/ui/label";
import { variantCanBePurchased } from "../lib/product-availability";

export default function ProductVariantOptions({
  variants,
  selected,
  quantities,
  onSelect,
  label,
  unavailable,
}: {
  variants: ProductDetail["variants"];
  selected: string;
  quantities: Record<string, number>;
  onSelect: (id: string) => void;
  label: string;
  unavailable: string;
}) {
  return (
    <RadioGroup
      name="variantId"
      value={selected}
      onValueChange={(value) => onSelect(String(value))}
      aria-label={label}
    >
      {variants.map((variant) => (
        <Label key={variant.id} className="flex items-center gap-3 font-normal">
          <RadioGroupItem
            value={variant.id}
            disabled={!variantCanBePurchased(variant, quantities)}
            required
          />
          <span>
            {variant.title}
            {!variantCanBePurchased(variant, quantities)
              ? ` · ${unavailable}`
              : ""}
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
