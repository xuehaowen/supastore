"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden } from "@/app/components";
import { submitManualOrder } from "./manual-order-actions";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";
import { VariantPicker } from "./variant-picker";

type Option = { id: string; label: string };

export function ManualOrderDialog({
  variants,
  paymentAccounts,
  pickupLocations,
  timezone,
}: {
  variants: Option[];
  paymentAccounts: Option[];
  pickupLocations: {
    id: string;
    name: string;
    address: string;
    scheduleRequired: boolean;
    weeklySchedule: Record<string, [string, string][]>;
    blackoutDates: string[];
    prepMinutes: number;
  }[];
  timezone: string;
}) {
  const [lines, setLines] = useState([0]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("shipping");
  const [pickupLocationId, setPickupLocationId] = useState("");
  const location = pickupLocations.find(
    (entry) => entry.id === pickupLocationId,
  );
  return (
    <AdminDialog
      open={open}
      trigger="Add manual order"
      title="Add manual order"
      description="Create a shipping or local pickup order using current catalog prices, tax, and fulfillment rules."
      onOpenChange={(open) => {
        setOpen(open);
        if (open) {
          setRequestKey((current) => current || crypto.randomUUID());
        }
      }}
    >
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          const request = new FormData(event.currentTarget);
          setPending(true);
          setError("");
          try {
            const result = await submitManualOrder(request);
            if ("error" in result) {
              setError(
                result.requestId
                  ? `${result.error} Reference: ${result.requestId}`
                  : result.error,
              );
            } else {
              setOpen(false);
              setRequestKey("");
              router.push(
                `/admin/orders?created=${encodeURIComponent(result.referenceCode)}`,
              );
              router.refresh();
            }
          } catch {
            setError(
              "Unable to save. Retry this order to recover any completed submission.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <Hidden name="requestKey" value={requestKey} />
        <Hidden name="itemCount" value={String(lines.length)} />
        <div className="two-col">
          <Field name="customerName" label="Customer name" />
          <Field name="customerEmail" label="Customer email" type="email" />
        </div>
        <label>
          Fulfillment
          <NativeSelect
            name="fulfillmentType"
            value={fulfillmentType}
            onChange={(event) => setFulfillmentType(event.target.value)}
          >
            <option value="shipping">Shipping</option>
            <option value="pickup">Local pickup</option>
          </NativeSelect>
        </label>
        {fulfillmentType === "pickup" ? (
          <fieldset className="grid gap-3">
            <legend>Local pickup</legend>
            <label>
              Pickup location
              <NativeSelect
                name="pickupLocationId"
                required
                value={pickupLocationId}
                onChange={(event) => setPickupLocationId(event.target.value)}
              >
                <option value="">Choose pickup location</option>
                {pickupLocations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.address}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {!pickupLocations.length && (
              <p>
                Configure a pickup location in Settings before creating a pickup
                order.
              </p>
            )}
            {location && (
              <>
                <p>
                  Times are in {timezone}. Allow at least {location.prepMinutes}{" "}
                  minutes for preparation.
                </p>
                <p>
                  {Object.entries(location.weeklySchedule)
                    .map(
                      ([day, windows]) =>
                        `${day}: ${windows.map(([start, end]) => `${start}–${end}`).join(", ") || "closed"}`,
                    )
                    .join("; ")}
                </p>
                {location.blackoutDates.length > 0 && (
                  <p>Unavailable dates: {location.blackoutDates.join(", ")}</p>
                )}
                <Field
                  name="pickupDate"
                  label="Pickup date"
                  type="date"
                  required={location.scheduleRequired}
                />
                <Field
                  name="pickupTime"
                  label="Pickup time"
                  type="time"
                  required={location.scheduleRequired}
                />
                <p>
                  Enter the exact start time of an opening window listed for the
                  selected day.
                </p>
                {!location.scheduleRequired && (
                  <p>Leave both date and time empty for unscheduled pickup.</p>
                )}
              </>
            )}
          </fieldset>
        ) : (
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
        )}
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
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating order…" : "Create order"}
        </Button>
      </form>
    </AdminDialog>
  );
}
