"use client";
import { useActionState, useState } from "react";
import type { CommerceRule } from "@/domain/commerce-evaluation";
import { submitCommerceRule } from "./actions";
import { Field, Hidden, Notice } from "@/app/components";
import { VariantPicker } from "@/app/admin/variant-picker";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
export function RuleForm({
  id,
  rule,
  version,
  variants,
  locations,
}: {
  id: string;
  rule?: CommerceRule;
  version: number;
  variants: { id: string; label: string }[];
  locations: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState(rule?.kind ?? "price");
  const [state, action, pending] = useActionState(submitCommerceRule, {});
  return (
    <form action={action} className="grid gap-4">
      <Notice error={state.error} />
      <Hidden name="id" value={id} />
      <Hidden name="version" value={String(version)} />
      <Field name="name" label="Rule name" value={rule?.name ?? ""} />
      <label>
        Rule kind
        <NativeSelect
          name="kind"
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as CommerceRule["kind"])
          }
        >
          <option value="price">Product price</option>
          <option value="availability">Product availability</option>
          <option value="reward">Reward rate</option>
          <option value="free_shipping">Free-shipping minimum</option>
          <option value="promotion">Promotion eligibility</option>
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2">
        <Checkbox name="enabled" defaultChecked={rule?.enabled ?? true} />
        Enabled
      </label>
      <Field
        name="priority"
        label="Priority (lower wins; unique per kind)"
        type="number"
        value={rule?.priority ?? 10}
      />
      {(kind === "price" || kind === "availability") && (
        <VariantPicker
          name="variantId"
          label="Target variant"
          initialOptions={variants}
          initialSelected={variants.find(
            (variant) => variant.id === rule?.variantIds[0],
          )}
        />
      )}
      {kind === "promotion" ? (
        <Field
          name="promotionCode"
          label="Existing promotion code"
          value={rule?.promotionCode ?? ""}
        />
      ) : (
        <>
          <Field
            name="value"
            label="Value"
            type="number"
            value={rule?.value ?? 0}
          />
          <p className="text-sm text-muted-foreground">
            {kind === "reward"
              ? "Basis points: 500 = 5%; 0 disables rewards for matching purchases. The reward program must also be enabled."
              : kind === "availability"
                ? "0 = not offered; 1 = offered. Stock, publication and fulfillment checks still apply."
                : "Amount in the store currency's minor units. For USD, 1250 = $12.50. Zero is a valid override."}
          </p>
        </>
      )}
      <label>
        Fulfillment method
        <NativeSelect
          name="method"
          defaultValue={rule?.conditions.fulfillmentMethods[0] ?? ""}
        >
          <option value="">Any method</option>
          <option value="shipping">Shipping</option>
          <option value="pickup">Pickup</option>
          <option value="local_delivery">Local delivery</option>
        </NativeSelect>
      </label>
      <Field
        name="countries"
        label="Countries"
        value={rule?.conditions.countries.join(", ") ?? ""}
        required={false}
      />
      <Field
        name="regions"
        label="States or regions"
        value={rule?.conditions.regions.join(", ") ?? ""}
        required={false}
      />
      <Field
        name="postalPrefixes"
        label="Postal prefixes"
        value={rule?.conditions.postalPrefixes.join(", ") ?? ""}
        required={false}
      />
      <p className="text-sm text-muted-foreground">
        Use comma-separated codes, such as US and CA, OR, WA. Regional/postal
        rules require exactly one country. A pickup-location rule requires
        Pickup and no destination conditions.
      </p>
      <label>
        Pickup location
        <NativeSelect
          name="pickupLocationId"
          defaultValue={rule?.conditions.pickupLocationIds[0] ?? ""}
        >
          <option value="">Any pickup location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Field
        name="startsAt"
        label="Start (UTC, optional)"
        value={rule?.conditions.startsAt ?? ""}
        required={false}
      />
      <Field
        name="endsAt"
        label="End, exclusive (UTC, optional)"
        value={rule?.conditions.endsAt ?? ""}
        required={false}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          Save rule
        </Button>
        {rule && (
          <Button
            type="submit"
            name="intent"
            value="delete"
            variant="outline"
            formNoValidate
            disabled={pending}
          >
            Delete rule
          </Button>
        )}
      </div>
    </form>
  );
}
