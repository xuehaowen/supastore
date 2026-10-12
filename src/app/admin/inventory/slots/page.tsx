import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { queuePage, QueuePagination } from "@/app/admin/queue-pagination";
import { VariantPicker } from "@/app/admin/variant-picker";
export default async function SlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const page = queuePage(query.page);
  const data = await db.transaction(async (tx) => {
    const identity = await verifyStaffInTransaction(tx, staff);
    const locations = await tx.select().from(pickupLocation);
    const areas = await tx.select().from(deliveryAreas);
    const slots = await tx
      .select()
      .from(fulfillmentSlots)
      .orderBy(
        asc(fulfillmentSlots.date),
        asc(fulfillmentSlots.startTime),
        asc(fulfillmentSlots.id),
      )
      .limit(51)
      .offset((page - 1) * 50);
    const variants = await tx
      .select({ id: productVariants.id, sku: productVariants.sku })
      .from(productVariants)
      .orderBy(asc(productVariants.sku), asc(productVariants.id))
      .limit(50);
    const quotas = slots.length
      ? await tx
          .select({
            id: slotVariantQuotas.id,
            slotId: slotVariantQuotas.slotId,
            variantId: slotVariantQuotas.variantId,
            quantity: slotVariantQuotas.quantity,
            sku: productVariants.sku,
          })
          .from(slotVariantQuotas)
          .innerJoin(
            productVariants,
            eq(productVariants.id, slotVariantQuotas.variantId),
          )
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
          .where(
            and(
              inArray(slotReservations.status, ["active", "consumed"]),
              inArray(
                slotReservations.slotId,
                slots.map((slot) => slot.id),
              ),
            ),
          )
          .groupBy(slotReservations.slotId)
      : [];
    return {
      slots: slots.slice(0, 50),
      hasNext: slots.length > 50,
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
      <QueuePagination
        query={query}
        path="/admin/inventory/slots"
        parameter="page"
        page={page}
        hasNext={data.hasNext}
      />
      <p>
        Capacity includes reserved and completed bookings. Variant quotas limit
        units independently of counted stock. Configure schedules and capacity
        in fulfillment settings; booked slots appear here.
      </p>
      {query.error && (
        <Alert variant="destructive">
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      )}
      {query.saved && (
        <Alert>
          <AlertDescription>Quota saved.</AlertDescription>
        </Alert>
      )}
      {data.owner && (
        <form action={createSlot} className="panel">
          <h2>Configure an upcoming window</h2>
          <p>
            Choose a window from the configured weekly schedule before customers
            book it, then set variant quotas below.
          </p>
          <label>
            Location
            <NativeSelect name="location" required>
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
            </NativeSelect>
          </label>
          <label>
            Date
            <Input name="date" type="date" required />
          </label>
          <label>
            Window start
            <Input name="startTime" type="time" required />
          </label>
          <Button type="submit">Create window</Button>
        </form>
      )}
      <section className="panel mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method / window</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Variant quotas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slots.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell className="font-medium">
                  {slot.pickupSlotId ? "Pickup" : "Local delivery"} {slot.date}{" "}
                  {slot.startTime}–{slot.endTime} ({slot.timezone})
                </TableCell>
                <TableCell>
                  {data.bookings.find((b) => b.slotId === slot.id)?.count ?? 0}{" "}
                  / {slot.capacity ?? "Unlimited"}
                </TableCell>
                <TableCell>
                  {data.quotas
                    .filter((q) => q.slotId === slot.id)
                    .map((q) => (
                      <p key={q.id} className="text-sm">
                        {q.sku}: {q.quantity}
                      </p>
                    ))}
                  {data.owner && (
                    <form
                      action={saveSlotQuota}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="slotId" value={slot.id} />
                      <VariantPicker
                        name="variantId"
                        label="Variant"
                        scope="quota"
                        initialOptions={data.variants.map((variant) => ({
                          id: variant.id,
                          label: variant.sku,
                        }))}
                      />
                      <label className="text-xs">
                        Max units
                        <Input
                          name="quantity"
                          type="number"
                          min="0"
                          max="2147483647"
                          required
                          className="mt-1 w-24"
                        />
                      </label>
                      <Button type="submit" size="sm" className="self-end">
                        Save quota
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.slots.length && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  No booked windows yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
