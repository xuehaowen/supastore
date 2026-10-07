import Link from "next/link";
import { eq, asc, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  orderShipments,
  shipmentItems,
  fulfillmentSlots,
  slotReservations,
  pickupTimeSlots,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { parseActionUuid } from "@/application/common/request-validation";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { shipmentAction } from "./actions";
export default async function Shipments({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; error?: string; saved?: string }>;
}) {
  const query = await searchParams;
  const staff = await staffIdentity();
  if (!query.orderId) {
    const candidates = await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff);
      return tx
        .select()
        .from(orders)
        .where(inArray(orders.lifecycleStatus, ["unpaid", "confirmed"]))
        .orderBy(orders.createdAt)
        .limit(100);
    });
    return (
      <main className="admin">
        <AdminNav />
        <h1>Shipments & booking</h1>
        {candidates.map((order) => (
          <p key={order.id}>
            <Link href={`/admin/fulfillment/shipments?orderId=${order.id}`}>
              {order.referenceCode} · {order.fulfillmentType} ·{" "}
              {order.lifecycleStatus}
            </Link>
          </p>
        ))}
      </main>
    );
  }
  const id = parseActionUuid(query.orderId, "Order");
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    const shipments = await tx
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.orderId, id))
      .orderBy(orderShipments.createdAt);
    const lines = await tx
      .select({
        orderItemId: shipmentItems.orderItemId,
        quantity: shipmentItems.quantity,
      })
      .from(shipmentItems)
      .innerJoin(
        orderShipments,
        eq(orderShipments.id, shipmentItems.shipmentId),
      )
      .where(eq(orderShipments.orderId, id));
    const [hold] = await tx
      .select()
      .from(slotReservations)
      .where(eq(slotReservations.orderId, id));
    const [source] = hold
      ? await tx
          .select()
          .from(fulfillmentSlots)
          .where(eq(fulfillmentSlots.id, hold.slotId))
      : [];
    const slots = source
      ? await tx
          .select({
            slot: fulfillmentSlots,
            locationId: pickupTimeSlots.locationId,
          })
          .from(fulfillmentSlots)
          .leftJoin(
            pickupTimeSlots,
            eq(pickupTimeSlots.id, fulfillmentSlots.pickupSlotId),
          )
          .orderBy(asc(fulfillmentSlots.date))
          .limit(1000)
      : [];
    const current = slots.find((s) => s.slot.id === source?.id);
    return {
      order,
      items,
      shipments,
      lines,
      hold,
      slots: slots.filter((s) =>
        source?.deliveryAreaId
          ? s.slot.deliveryAreaId === source.deliveryAreaId
          : s.locationId === current?.locationId && !!s.slot.pickupSlotId,
      ),
    };
  });
  if (!data.order) return <main>Order not found.</main>;
  const order = data.order;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Shipments & booking</h1>
      <Link href={`/admin/orders/${id}`}>Order {order.referenceCode}</Link>
      <Notice error={query.error} />
      {query.saved && <p role="status">Fulfillment saved.</p>}
      {data.shipments.map((shipment) => (
        <section className="panel" key={shipment.id}>
          <h2>
            {shipment.carrier} ·{" "}
            {shipment.trackingNumber || "No tracking number"}
          </h2>
          <p>{shipment.status}</p>
          {shipment.status === "dispatched" &&
            order.lifecycleStatus === "confirmed" && (
              <form action={shipmentAction}>
                <Hidden name="operation" value="delivered" />
                <Hidden name="orderId" value={id} />
                <Hidden name="shipmentId" value={shipment.id} />
                <p>
                  Record receipt only after verifying this shipment reached the
                  customer.
                </p>
                <button>Record verified delivery</button>
              </form>
            )}
        </section>
      ))}
      {order.fulfillmentType !== "pickup" &&
        order.lifecycleStatus === "confirmed" && (
          <form action={shipmentAction} className="panel">
            <h2>Dispatch selected units</h2>
            <Hidden name="operation" value="dispatch" />
            <Hidden name="orderId" value={id} />
            <Hidden name="requestKey" value={crypto.randomUUID()} />
            <Field name="carrier" label="Carrier / delivery method" />
            <Field
              name="trackingNumber"
              label="Tracking number"
              required={false}
            />
            <label>
              Callback provider
              <select name="provider">
                <option value="manual">Staff verified delivery</option>
                {process.env.CARRIER_WEBHOOK_PROVIDER && (
                  <option value={process.env.CARRIER_WEBHOOK_PROVIDER}>
                    {process.env.CARRIER_WEBHOOK_PROVIDER}
                  </option>
                )}
              </select>
            </label>
            {data.items.map((item) => {
              const remaining =
                item.quantity -
                data.lines
                  .filter((line) => line.orderItemId === item.id)
                  .reduce((sum, line) => sum + line.quantity, 0);
              return (
                <Field
                  key={item.id}
                  name={`item:${item.id}`}
                  label={`${item.catalogSnapshot.title || item.catalogSnapshot.sku || "Order item"} (${remaining} units remaining)`}
                  type="number"
                  value={String(remaining)}
                />
              );
            })}
            <button>Dispatch shipment</button>
          </form>
        )}
      {data.hold?.status === "active" &&
        ["unpaid", "confirmed"].includes(order.lifecycleStatus) &&
        !data.shipments.length && (
          <form action={shipmentAction} className="panel">
            <h2>Reschedule booking</h2>
            <Hidden name="operation" value="reschedule" />
            <Hidden name="orderId" value={id} />
            <label>
              Destination slot
              <select name="slotId">
                <option value="">
                  Choose a new date and window start below
                </option>
                {data.slots.map(({ slot }) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.date} {slot.startTime}–{slot.endTime}
                  </option>
                ))}
              </select>
            </label>
            <Field
              name="date"
              label="New date (when choosing a new window)"
              type="date"
              required={false}
            />
            <Field
              name="startTime"
              label="Window start (must match configured schedule)"
              type="time"
              required={false}
            />
            <Field name="reason" label="Reschedule reason" />
            <p>
              Destination capacity is acquired before the original booking is
              released.
            </p>
            <button>Reschedule</button>
          </form>
        )}
    </main>
  );
}
