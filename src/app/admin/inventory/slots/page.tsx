import { redirect } from "next/navigation";
import { asc, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  fulfillmentSlots,
  slotReservations,
  slotVariantQuotas,
  productVariants,
  pickupLocation,
  deliveryAreas,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { saveSlotQuota, createSlot } from "./actions";
export default async function SlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const data = await db.transaction(async (tx) => {
    const identity = await verifyStaffInTransaction(tx, staff);
    const locations = await tx.select().from(pickupLocation);
    const areas = await tx.select().from(deliveryAreas);
    const slots = await tx
      .select()
      .from(fulfillmentSlots)
      .orderBy(asc(fulfillmentSlots.date), asc(fulfillmentSlots.startTime))
      .limit(200);
    const variants = await tx
      .select({ id: productVariants.id, sku: productVariants.sku })
      .from(productVariants)
      .orderBy(asc(productVariants.sku));
    const quotas = slots.length
      ? await tx
          .select()
          .from(slotVariantQuotas)
          .where(
            inArray(
              slotVariantQuotas.slotId,
              slots.map((s) => s.id),
            ),
          )
      : [];
    const bookings = slots.length
      ? await tx
          .select({
            slotId: slotReservations.slotId,
            count: sql<number>`count(*)::int`,
          })
          .from(slotReservations)
          .where(inArray(slotReservations.status, ["active", "consumed"]))
          .groupBy(slotReservations.slotId)
      : [];
    return {
      slots,
      locations,
      areas,
      variants,
      quotas,
      bookings,
      owner: identity.role === "owner",
    };
  });
  return (
    <main className="admin">
      <AdminNav />
      <h1>Fulfillment slot inventory</h1>
      <p>
        Capacity includes reserved and completed bookings. Variant quotas limit
        units independently of counted stock. Configure schedules and capacity
        in fulfillment settings; booked slots appear here.
      </p>
      {query.error && <p role="alert">{query.error}</p>}
      {query.saved && <p role="status">Quota saved.</p>}
      {data.owner && (
        <form action={createSlot} className="panel">
          <h2>Configure an upcoming window</h2>
          <p>
            Choose a window from the configured weekly schedule before customers
            book it, then set variant quotas below.
          </p>
          <label>
            Location
            <select name="location" required>
              {data.locations.map((location) => (
                <option key={location.id} value={`pickup:${location.id}`}>
                  Pickup: {location.name}
                </option>
              ))}
              {data.areas
                .filter((area) => area.isActive)
                .map((area) => (
                  <option key={area.id} value={`local_delivery:${area.id}`}>
                    Delivery: {area.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Date
            <input name="date" type="date" required />
          </label>
          <label>
            Window start
            <input name="startTime" type="time" required />
          </label>
          <button type="submit">Create window</button>
        </form>
      )}
      <table>
        <thead>
          <tr>
            <th>Method / window</th>
            <th>Bookings</th>
            <th>Variant quotas</th>
          </tr>
        </thead>
        <tbody>
          {data.slots.map((slot) => (
            <tr key={slot.id}>
              <td>
                {slot.pickupSlotId ? "Pickup" : "Local delivery"} {slot.date}{" "}
                {slot.startTime}–{slot.endTime} ({slot.timezone})
              </td>
              <td>
                {data.bookings.find((b) => b.slotId === slot.id)?.count ?? 0} /{" "}
                {slot.capacity ?? "Unlimited"}
              </td>
              <td>
                {data.quotas
                  .filter((q) => q.slotId === slot.id)
                  .map((q) => (
                    <p key={q.id}>
                      {data.variants.find((v) => v.id === q.variantId)?.sku}:{" "}
                      {q.quantity}
                    </p>
                  ))}
                {data.owner && (
                  <form action={saveSlotQuota}>
                    <input type="hidden" name="slotId" value={slot.id} />
                    <label>
                      Variant
                      <select name="variantId" required>
                        {data.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.sku}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Maximum units
                      <input
                        name="quantity"
                        type="number"
                        min="0"
                        max="2147483647"
                        required
                      />
                    </label>
                    <button type="submit">Save quota</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.slots.length && <p>No booked windows yet.</p>}
    </main>
  );
}
