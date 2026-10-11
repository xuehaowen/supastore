"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden } from "@/app/components";
import { createManualOrderAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { VariantPicker } from "./variant-picker";

type Option = { id: string; label: string };

export function ManualOrderDialog({
  variants,
  paymentAccounts,
}: {
  variants: Option[];
  paymentAccounts: Option[];
}) {
  const [lines, setLines] = useState([0]);
  const [requestKey, setRequestKey] = useState("");
  return (
    <AdminDialog
      trigger="Add manual order"
      title="Add manual order"
      description="Create an order using current catalog prices, tax, and shipping rules."
      onOpenChange={(open) => {
        if (open) setRequestKey(crypto.randomUUID());
      }}
    >
      <form action={createManualOrderAction} className="grid gap-4">
        <Hidden name="requestKey" value={requestKey} />
        <Hidden name="itemCount" value={String(lines.length)} />
        <div className="two-col">
          <Field name="customerName" label="Customer name" />
          <Field name="customerEmail" label="Customer email" type="email" />
        </div>
        <div className="two-col">
          <Field name="country" label="Shipping country code" value="US" />
          <Field name="address" label="Shipping address" />
          <Field
            name="region"
            label="Shipping state/region code (e.g. CA)"
            required={false}
          />
          <Field
            name="postalCode"
            label="Shipping ZIP/postal code"
            required={false}
          />
        </div>
        <label>
          Payment method
          <NativeSelect name="paymentAccountId" required>
            <option value="">Choose payment method</option>
            {paymentAccounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <fieldset className="manual-order-lines">
          <legend>Items</legend>
          {lines.map((line, index) => (
            <div className="manual-order-line" key={line}>
              <VariantPicker
                name={`variantId-${index}`}
                label="Product variant"
                initialOptions={variants}
              />
              <Field
                name={`quantity-${index}`}
                label="Quantity"
                type="number"
                value={1}
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item !== line),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLines((current) => [...current, Math.max(...current) + 1])
            }
          >
            <Plus aria-hidden="true" /> Add item
          </Button>
        </fieldset>
        <Button type="submit">Create order</Button>
      </form>
    </AdminDialog>
  );
}
