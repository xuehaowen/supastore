"use client";
import { startTransition, useActionState, useState } from "react";
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
  const targets = (rule?.variantIds ?? []).map(
    (id) =>
      variants.find((variant) => variant.id === id) ?? {
        id,
        label: `Unavailable variant · ${id}`,
      },
  );
  const missingTargets = targets.some(
    (target) => !variants.some((variant) => variant.id === target.id),
  );
  return (
    <form
      action={action}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        startTransition(() => action(data));
      }}
    >
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
      {missingTargets && (kind === "price" || kind === "availability") && (
        <p role="alert">
          Some targeted variants no longer exist. Select replacement targets or
          delete this rule.
        </p>
      )}
      {(kind === "price" || kind === "availability") && (
        <VariantPicker
          name="variantIds"
          label="Target variant"
          initialOptions={variants}
          multiple
          required={kind === "price"}
          initialSelections={targets}
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
                ? "0 = not offered; 1 = offered. Leave target variants empty to apply to all variants. Stock, publication and fulfillment checks still apply."
                : "Amount in the store currency's minor units. For USD, 1250 = $12.50. Zero is a valid override."}
          </p>
        </>
      )}
      <fieldset className="grid gap-2">
        <legend>Fulfillment methods</legend>
        <p className="text-sm text-muted-foreground">
          Leave unchecked for any method.
        </p>
        {(
          [
            ["shipping", "Shipping"],
            ["pickup", "Pickup"],
            ["local_delivery", "Local delivery"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <Checkbox
              name="methods"
              value={value}
              defaultChecked={
                rule?.conditions.fulfillmentMethods.includes(value) ?? false
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
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
      <fieldset className="grid gap-2">
        <legend>Pickup locations</legend>
        <p className="text-sm text-muted-foreground">
          Leave unchecked for any pickup location.
        </p>
        {locations.map((location) => (
          <label key={location.id} className="flex items-center gap-2">
            <Checkbox
              name="pickupLocationIds"
              value={location.id}
              defaultChecked={
                rule?.conditions.pickupLocationIds.includes(location.id) ??
                false
              }
            />
            {location.name}
          </label>
        ))}
      </fieldset>
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
