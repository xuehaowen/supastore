import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderReturns,
  orderReturnItems,
  orderItems,
  quotes,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { orderItemName } from "@/domain/catalog/order-item-name";
import { reviewReturnAction, receiveReturnAction } from "@/app/return-actions";
export default async function ReturnDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const [row] = await tx
      .select({ goodsReturn: orderReturns, order: orders })
      .from(orderReturns)
      .innerJoin(orders, eq(orders.id, orderReturns.orderId))
      .where(eq(orderReturns.id, id));
    if (!row) return null;
    const items = await tx
      .select({ item: orderReturnItems, purchased: orderItems })
      .from(orderReturnItems)
      .innerJoin(orderItems, eq(orderItems.id, orderReturnItems.orderItemId))
      .where(eq(orderReturnItems.returnId, id));
    const [quote] = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.id, row.order.quoteId));
    return { ...row, items, quoteItems: quote?.itemsSnapshot };
  });
  if (!data) notFound();
  const r = data.goodsReturn;
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/returns">← Product returns</Link>
      <h1>Return · {data.order.referenceCode}</h1>
      <p>
        {data.order.guestName} · {r.status}
      </p>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Return updated.</AlertDescription>
        </Alert>
      )}
      <section className="panel">
        <h2>Customer request</h2>
        <p>{r.reason}</p>
        {data.items.map(({ item: i, purchased }) => (
          <p key={i.id}>
            {orderItemName(purchased, data.quoteItems)} · {i.quantity} units ·{" "}
            {i.restockedQuantity} restocked · {i.damagedQuantity} damaged
          </p>
        ))}
      </section>
      {["requested", "approved"].includes(r.status) && (
        <section className="panel">
          <h2>Review</h2>
          <form action={reviewReturnAction}>
            <Hidden name="returnId" value={id} />
            <label>
              Decision
              <NativeSelect name="decision">
                {r.status === "requested" && (
                  <>
                    <option value="approved">Approve return</option>
                    <option value="rejected">Reject return</option>
                  </>
                )}
                <option value="cancelled">Cancel return</option>
              </NativeSelect>
            </label>
            <Field name="reason" label="Review reason" />
            <Button type="submit">Save decision</Button>
          </form>
        </section>
      )}
      {r.status === "approved" && (
        <section className="panel">
          <h2>Receive goods</h2>
          <p>
            Account for every approved unit as restockable or damaged. A damaged
            unit can still be refunded after owner review.
          </p>
          <form action={receiveReturnAction}>
            <Hidden name="returnId" value={id} />
            {data.items.map(({ item: i, purchased }) => (
              <fieldset key={i.id}>
                <legend>
                  {orderItemName(purchased, data.quoteItems)} · {i.quantity}{" "}
                  approved units
                </legend>
                <Hidden name="itemIds" value={i.id} />
                <Field
                  name={`restock.${i.id}`}
                  label="Restockable units"
                  type="number"
                  value={i.quantity}
                />
                <Field
                  name={`damaged.${i.id}`}
                  label="Damaged units"
                  type="number"
                  value="0"
                />
              </fieldset>
            ))}
            <Button type="submit">Record goods receipt</Button>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Refund settlement</h2>
        <p>
          Owner approval is separate from receipt. Review original funding and
          remaining refund entitlements on the order.
        </p>
        <Link href={`/admin/orders/${data.order.id}`}>
          Review order & refund
        </Link>
      </section>
    </main>
  );
}
