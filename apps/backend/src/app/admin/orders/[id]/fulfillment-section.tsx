import type { ReactNode } from "react";
import type { AdminOrderDetail } from "@/application/use-cases/orders/get-admin-order-detail";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field } from "@/app/components";
import { Button } from "@supastore/ui/button";
import Link from "next/link";
import { shipmentCoverageComplete } from "@/domain/shipment";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  fulfillConfirmedOrder,
  dispatchConfirmedOrder,
  markOrderReady,
  completeOrderPickup,
} from "@/app/actions";

export function OrderFulfillmentSection({
  data,
  identity,
  detailReturnTo,
}: {
  data: AdminOrderDetail;
  identity: ReactNode;
  detailReturnTo: string;
}) {
  const o = data.order,
    id = o.id;
  return (
    <section className="panel">
      <h2>Fulfillment</h2>
      <Link
        href={`/admin/fulfillment/shipments?orderId=${id}&back=${encodeURIComponent(detailReturnTo)}`}
      >
        Manage partial shipments & reschedule booking
      </Link>
      <p>
        {data.fulfillment?.status.replaceAll("_", " ")} ·{" "}
        {data.fulfillment?.carrier || ""} ·{" "}
        {data.fulfillment?.trackingNumber || ""}
      </p>
      {data.fulfillment?.status === "shipped" &&
        !shipmentCoverageComplete(data.items, data.shipmentLines) && (
          <p>
            Partially dispatched.{" "}
            <Link
              href={`/admin/fulfillment/shipments?orderId=${id}&back=${encodeURIComponent(detailReturnTo)}`}
            >
              Dispatch remaining units
            </Link>
          </p>
        )}
      {o.lifecycleStatus === "confirmed" &&
        o.fulfillmentType === "shipping" &&
        !(
          data.fulfillment?.status === "shipped" &&
          !shipmentCoverageComplete(data.items, data.shipmentLines)
        ) && (
          <AdminDialog
            trigger={
              data.fulfillment?.status === "shipped"
                ? "Record delivery"
                : "Dispatch shipment"
            }
            title={
              data.fulfillment?.status === "shipped"
                ? "Record completed delivery"
                : "Dispatch shipment"
            }
            description="Dispatch consumes stock once. Record delivery when the customer receives the order to release purchase rewards."
          >
            <form
              action={
                data.fulfillment?.status === "shipped"
                  ? fulfillConfirmedOrder
                  : dispatchConfirmedOrder
              }
            >
              {identity}
              <Field
                name="carrier"
                label="Carrier or delivery method"
                value={data.fulfillment?.carrier ?? undefined}
              />
              <Field
                name="trackingNumber"
                label="Tracking number"
                value={data.fulfillment?.trackingNumber ?? undefined}
                required={false}
              />
              <Button type="submit">
                {data.fulfillment?.status === "shipped"
                  ? "Record delivery"
                  : "Dispatch shipment"}
              </Button>
            </form>
          </AdminDialog>
        )}
      {o.lifecycleStatus === "confirmed" && o.fulfillmentType === "pickup" && (
        <div className="grid gap-4">
          {data.fulfillment?.status !== "ready_for_pickup" && (
            <form action={markOrderReady}>
              {identity}
              <Button type="submit">Mark ready for pickup</Button>
            </form>
          )}
          {data.fulfillment?.status === "ready_for_pickup" ? (
            <AdminDialog
              trigger="Complete pickup handoff"
              title="Verify pickup recipient"
            >
              <form action={completeOrderPickup}>
                {identity}
                <Field
                  label="Recipient / authorized recipient"
                  name="handoffActor"
                />
                <label>
                  Verification method
                  <NativeSelect
                    name="verificationMethod"
                    defaultValue="scoped_order_page"
                  >
                    <option value="scoped_order_page">
                      Customer order page checked
                    </option>
                    <option value="owner_assisted">
                      Owner-assisted verification
                    </option>
                  </NativeSelect>
                </label>
                <Button type="submit">Complete pickup handoff</Button>
              </form>
            </AdminDialog>
          ) : (
            <p>
              Mark this order ready for pickup before completing the handoff.
            </p>
          )}
        </div>
      )}
      <Link href="/admin/fulfillment">All fulfillment work</Link>
    </section>
  );
}
